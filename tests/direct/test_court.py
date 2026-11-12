import hashlib
import json
import os
import sys
from datetime import datetime,timezone
from pathlib import Path
import pytest
from eth_account import Account
from conftest import to_hex

T=2000000000
REGISTRY='0x'+'12'*20
SELLER=Account.from_key(bytes.fromhex('11'*32))
BUYER=Account.from_key(bytes.fromhex('22'*32))
ENDPOINT='https://refund-court.vercel.app/api/weather/broken'

def warp(vm,t):
    vm.warp(datetime.fromtimestamp(t,timezone.utc).isoformat())
    sdk=sys.modules.get('genlayer.gl')
    if sdk is not None and getattr(sdk,'message_raw',None) is not None:sdk.message_raw['datetime']=vm._datetime

def selfcall(vm,fn,*args):
    old=vm.sender;vm.sender=vm._contract_address
    fn(*args);vm.sender=old

@pytest.fixture
def env(direct_vm,direct_deploy,monkeypatch):
    vm=direct_vm;vm._chain_id=61999;vm.sender=bytes.fromhex(SELLER.address[2:]);warp(vm,T)
    c=direct_deploy('contracts/refund_court.py',REGISTRY)
    from genlayer import gl,Address
    old=gl.message
    gl.message=gl.MessageType(contract_address=Address(vm._contract_address),sender_address=old.sender_address,origin_address=old.origin_address,value=old.value,chain_id=old.chain_id)
    gl.message_raw['contract_address']=Address(vm._contract_address)
    service={'id':'service-1','seller':SELLER.address.lower(),'endpoint':ENDPOINT,'status':'FROZEN','hash':'frozen','refund_wei':'5','price_units':'1000','criteria':['The report uses Celsius.','The city matches the request.']}
    class Proxy:
        def view(self):return self
        def get_service(self,key):return json.dumps(service)
        def emit(self,**kwargs):return self
        def activate_bond(self,*args):pass
        def activate_case(self,*args):pass
        def settle_case(self,*args):pass
        def finalize_reservation(self,*args):pass
    monkeypatch.setattr(gl,'get_contract_at',lambda addr:Proxy())
    scope={}
    exec(compile(Path('contracts/refund_court.py').read_text().split('\n@gl.evm.contract_interface')[0],'<helpers>','exec'),scope)
    return vm,c,service,scope

def funded(env):
    vm,c,service,helpers=env
    c.prepare_bond('service-1');vm.value=20;c.deposit_bond('service-1');vm.value=0
    selfcall(vm,c.activate_bond,'service-1')
    vm.sender=bytes.fromhex(BUYER.address[2:])
    return vm,c,service,helpers

def evidence(payment='0x'+'aa'*32,body=None):
    req=json.dumps({'buyer':BUYER.address.lower(),'city':'Lagos','endpoint':ENDPOINT,'delivered_at':T,'nonce':'test-nonce-123'})
    body=body or '{"city":"Lagos","temperature":86,"unit":"F"}'
    digest=hashlib.sha256((req+body+payment).encode()).digest()
    sig=SELLER.unsafe_sign_hash(digest).signature.hex()
    return payment,req,body,'0x'+sig.removeprefix('0x')

def reserved(env):
    vm,c,s,h=funded(env)
    c.reserve_claim('service-1',*evidence())
    selfcall(vm,c.finalize_reservation,'case-1')
    vm.value=1;c.deposit_fee('case-1');vm.value=0
    selfcall(vm,c.activate_case,'case-1')
    return vm,c,s,h

def test_signature_vectors_and_tampering(env):
    *_,h=env
    for i in range(4):
        digest=hashlib.sha256(str(i).encode()).digest();sig=SELLER.unsafe_sign_hash(digest).signature.hex()
        assert h['recover'](digest,'0x'+sig.removeprefix('0x'))==SELLER.address.lower()
        assert h['recover'](hashlib.sha256(b'other').digest(),'0x'+sig.removeprefix('0x'))!=SELLER.address.lower()
    with pytest.raises(Exception):h['recover'](digest,'0x'+'00'*65)

def test_forgery_and_replay_are_code_rejections(env):
    vm,c,*_=funded(env)
    args=evidence()
    forged=args[:2]+(args[2]+' ',args[3])
    with vm.expect_revert('signature does not recover'):c.reserve_claim('service-1',*forged)
    c.reserve_claim('service-1',*args)
    with vm.expect_revert('already used'):c.reserve_claim('service-1',*args)
    assert json.loads(c.get_bond('service-1'))['locked']=='5'

@pytest.mark.parametrize('verdict,outcome,buyer_credit,seller_credit',[('MET','DELIVERED','0','1'),('NOT_MET','REFUND','6','0'),('UNCLEAR','VOID','1','0')])
def test_judgment_settlement(env,monkeypatch,verdict,outcome,buyer_credit,seller_credit):
    vm,c,s,h=reserved(env)
    import genlayer.gl as gl
    from types import SimpleNamespace
    def post(url,**kw):
        method=json.loads(kw['body'])['method']
        result={'eth_chainId':'0x14a34','eth_blockNumber':'0x64','eth_getBlockByNumber':{'hash':'0x'+'bb'*32},'eth_getTransactionReceipt':{'status':'0x1','transactionHash':'0x'+'aa'*32,'blockNumber':'0x60','blockHash':'0x'+'bb'*32,'logs':[{'address':h['TOKEN'],'topics':[h['TRANSFER'],'0x'+BUYER.address[2:].lower().zfill(64),'0x'+SELLER.address[2:].lower().zfill(64)],'data':hex(1000)}]}}[method]
        return SimpleNamespace(status=200,body=json.dumps({'result':result}).encode())
    monkeypatch.setattr(gl.nondet.web,'post',post)
    vm.mock_llm(r'.*Judge exactly ONE.*',json.dumps({'verdict':verdict,'quote':'"unit":"F"'}))
    c.judge_claim('case-1')
    assert vm.run_validator()
    assert vm.run_validator(leader_result={'verdict':verdict,'quote':'Lagos'})
    assert not vm.run_validator(leader_result={'verdict':verdict,'quote':'Invented quotation'})
    selfcall(vm,c.settle_case,'case-1')
    assert json.loads(c.get_case('case-1'))['status']==outcome
    assert c.get_credit(BUYER.address)['available_wei']==buyer_credit
    assert c.get_credit(SELLER.address)['available_wei']==seller_credit
    assert json.loads(c.get_bond('service-1'))['balance']==('15' if outcome=='REFUND' else '20')

def test_expiry_refunds_fee_and_unlocks_bond(env):
    vm,c,*_=reserved(env)
    vm.sender=bytes.fromhex(SELLER.address[2:])
    with vm.expect_revert('open claims'):c.request_withdrawal('service-1')
    warp(vm,T+3601);c.expire_case('case-1')
    assert json.loads(c.get_case('case-1'))['status']=='VOID'
    assert c.get_credit(BUYER.address)['available_wei']=='1'
    assert json.loads(c.get_bond('service-1'))['locked']=='0'
    with vm.expect_revert('case not expired'):c.expire_case('case-1')

def test_invalid_payable_intents_always_credit_sender(env):
    vm,c,*_=env
    vm.value=7;c.deposit_bond('missing');vm.value=3;c.deposit_fee('missing');vm.value=0
    assert c.get_credit(SELLER.address)['available_wei']=='10'

def test_bond_cooldown(env):
    vm,c,*_=funded(env);vm.sender=bytes.fromhex(SELLER.address[2:])
    c.request_withdrawal('service-1')
    with vm.expect_revert('cooldown'):c.finish_withdrawal('service-1')
    warp(vm,T+86401);c.finish_withdrawal('service-1')
    assert c.get_credit(SELLER.address)['available_wei']=='20'
    assert json.loads(c.get_bond('service-1'))['status']=='CLOSED'
