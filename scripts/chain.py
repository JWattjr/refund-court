"""StudioNet transport. Persist hashes before polling; never silently rebroadcast."""
import importlib.metadata
import json
import time
from pathlib import Path
from eth_account import Account
from genlayer_py import create_client, studionet
from genlayer_py.types import TransactionHashVariant
from genlayer_py.provider import provider

ROOT = Path(__file__).resolve().parent.parent
assert importlib.metadata.version('genlayer-py') == '0.18.0'
UA = {'User-Agent':'Mozilla/5.0 RefundCourt/1.0'}
_post = provider.requests.post
def browser_post(url, **kwargs):
    kwargs['headers'] = {**kwargs.get('headers',{}), **UA}
    kwargs.setdefault('timeout',45)
    return _post(url, **kwargs)
provider.requests.post = browser_post

def accounts():
    path = ROOT / '.secrets/accounts.json'
    path.parent.mkdir(exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps([Account.create().key.hex() for _ in range(2)]))
    return [Account.from_key(key) for key in json.loads(path.read_text())]

def client(index=0):
    return create_client(chain=studionet, account=accounts()[index])

def load():
    path = ROOT / 'deploy/proof.json'
    return json.loads(path.read_text()) if path.exists() else {'network':'StudioNet','chainId':61999,'releaseStatus':'IN_PROGRESS','contracts':{},'transactions':{},'cases':{},'deposits':{}}

def save(proof):
    target = ROOT / 'deploy/proof.json'
    temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps(proof,indent=2),encoding='utf8')
    temp.replace(target)

def success(receipt):
    leader = ((receipt.get('consensus_data') or {}).get('leader_receipt') or [{}])[0]
    return receipt.get('status_name',receipt.get('status')) in ('FINALIZED',7,'7') and (receipt.get('txExecutionResultName',leader.get('execution_result')) in ('SUCCESS','FINISHED_WITH_RETURN') or receipt.get('value_credited') is True)

def final(hash_value, label, allow_error=False):
    target = ROOT / 'deploy/receipts' / (label+'.json')
    for attempt in range(180):
        r = client().provider.make_request('eth_getTransactionByHash',[hash_value])['result']
        if r and r.get('status_name',r.get('status')) in ('FINALIZED',7,'7'):
            target.write_text(json.dumps(r,indent=2),encoding='utf8')
            print(label, 'FINALIZED_SUCCESS' if success(r) else 'FINALIZED_ERROR',hash_value,flush=True)
            if not success(r) and not allow_error:
                raise RuntimeError('Execution failed; inspect '+str(target))
            return r
        if attempt % 6 == 0: print(label, r.get('status') if r else 'SUBMITTED',flush=True)
        time.sleep(10)
    raise RuntimeError('Still pending; rerun to resume '+hash_value)

def tx(proof,label,address=None,method=None,args=None,code=None,index=0,value=0,allow_error=False):
    if label not in proof['transactions']:
        if value:
            approval = ROOT / '.secrets/deposit-approval.json'
            budget = json.loads(approval.read_text()).get('approvedTotalWei',0) if approval.exists() else 0
            if not 0 < budget <= 10**17 or sum(proof['deposits'].values())+value > budget:
                raise RuntimeError('Owner approval required before deposit: '+str(value)+' wei')
        marker = ROOT / '.secrets/ambiguous-broadcast.json'
        if marker.exists(): raise RuntimeError('Reconcile ambiguous submission before any new write')
        c = client(index)
        fees = {'feeValue':0}
        marker.write_text(json.dumps({'label':label,'address':address,'method':method,'valueWei':value}))
        h = c.deploy_contract(code,args=args or [],fees=fees) if code is not None else c.write_contract(address,method,args=args or [],value=value,fees=fees)
        h = h.hex() if hasattr(h,'hex') else str(h)
        h = h if h.startswith('0x') else '0x'+h
        proof['transactions'][label] = h
        if value: proof['deposits'][label] = value
        save(proof)
        marker.unlink()
        print(label,'SUBMITTED',h,flush=True)
    r = final(proof['transactions'][label],label,allow_error)
    for i,child in enumerate(r.get('triggered_transactions') or []):
        child_label = label+'-child-'+str(i)
        proof['transactions'][child_label] = child
        save(proof)
        final(child,child_label)
    return r

def read(address,method,args=None):
    result = client().read_contract(address,method,args=args or [],transaction_hash_variant=TransactionHashVariant.LATEST_FINAL)
    time.sleep(2)
    return json.loads(result) if isinstance(result,str) and result.startswith(('{','[')) else result
