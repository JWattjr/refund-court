"""Fail closed. Recorded verdicts, lifecycle finality and native credit are distinct."""
import hashlib
import base64
import json
import subprocess
import sys
import time
from datetime import datetime,timezone
from chain import ROOT,load,success,read,client,UA

p=load();errors=[];checks=[]
def check(ok,label):
    checks.append({'check':label,'passed':bool(ok)})
    if not ok:errors.append(label)

check(p.get('chainId')==61999 and int(client().provider.make_request('eth_chainId',[])['result'],16)==61999,'StudioNet chain 61999')
for name,c in p['contracts'].items():
    check(hashlib.sha256((ROOT/'contracts'/c['source']).read_bytes()).hexdigest()==c['sha256'],name+' source hash')
    deployed=json.loads((ROOT/'deploy/receipts'/('deploy-'+name+'.json')).read_text())
    deployed_code=base64.b64decode(deployed.get('data',{}).get('contract_code',''))
    check(hashlib.sha256(deployed_code).hexdigest()==c['sha256'] and deployed.get('to_address','').lower()==c['address'].lower(),name+' exact deployed source and address')
for label,h in p['transactions'].items():
    file=ROOT/'deploy/receipts'/(label+'.json')
    r=json.loads(file.read_text()) if file.exists() else {}
    remote=client().provider.make_request('eth_getTransactionByHash',[h])['result'] or {}
    time.sleep(1.5)
    expected=label.startswith('reject-')
    check(r.get('hash')==h and remote.get('hash')==h,label+' matching RPC receipt')
    check(remote.get('status_name',remote.get('status'))=='FINALIZED',label+' finalized')
    check(not success(remote) if expected else success(remote),label+(' expected execution rejection' if expected else ' execution success'))
    if expected:
        text=json.dumps(remote).lower()
        for leader in (remote.get('consensus_data') or {}).get('leader_receipt',[]):
            if isinstance(leader.get('result'),str):
                try:text+=' '+base64.b64decode(leader['result']).decode('utf8',errors='replace').lower()
                except ValueError:pass
        check(('already used' if 'replay' in label else 'signature does not recover') in text,label+' deterministic rejection reason')
    if label in p['deposits']:
        check(remote.get('value_credited') is True and int(remote.get('value',0))==p['deposits'][label],label+' native deposit credited')

registry=p.get('contracts',{}).get('ServicePromise',{}).get('address')
court=p.get('contracts',{}).get('RefundCourt',{}).get('address')
services=[read(registry,'get_service',[k]) for k in read(registry,'get_ids',[0,50])] if registry else []
cases=[read(court,'get_case',[k]) for k in read(court,'get_ids',[0,50])] if court else []
check(any(s['status']=='REJECTED' for s in services),'case 1: subjective compile rejection')
frozen=[s for s in services if s['status']=='FROZEN']
for s in services:
    unhashed={**s,'hash':''}
    check(hashlib.sha256(json.dumps(unhashed,sort_keys=True,separators=(',',':')).encode()).hexdigest()==s['hash'],'service '+s['id']+' frozen hash integrity')
check(bool(frozen) and all(2<=len(s['criteria'])<=4 for s in frozen),'case 2: frozen observable criteria')
check(bool(frozen) and all('bond-'+s['id'] in p['transactions'] and read(court,'get_bond',[s['id']]).get('status') in ('ACTIVE','COOLDOWN','CLOSED') for s in frozen),'case 2: finalized seller bond deposits')
by_mode={}
for c in cases:
    s=next((s for s in services if s['id']==c['service_id']),{})
    mode=s.get('endpoint','').split('/')[-1];by_mode[mode]=c
    check(c['promise_hash']==s.get('hash'),'case '+c['id']+' references frozen promise hash')
    if c['status'] in ('REFUND','DELIVERED'):
        check(len(c['verdicts'])==len(s.get('criteria',[])),'case '+c['id']+' criterion coverage')
        check([v['criterion'] for v in c['verdicts']]==s.get('criteria'),'case '+c['id']+' exact frozen criteria')
        check(all(v['quote'] and v['quote'] in c['response'] for v in c['verdicts']),'case '+c['id']+' verbatim quotations')
        check(c['payment'].get('status')=='PAID','case '+c['id']+' validator-confirmed Base payment')
    artifact_file=ROOT/'deploy/payments'/(mode+'.json')
    if artifact_file.exists():
        a=json.loads(artifact_file.read_text())
        check(a['request']==c['request'] and a['response']==c['response'] and a['signature']==c['signature'] and a['payment_hash']==c['payment_hash'],'case '+c['id']+' byte-exact paid evidence')
        check(hashlib.sha256((c['request']+c['response']+c['payment_hash']).encode()).hexdigest()==c['evidence_sha256'],'case '+c['id']+' signed digest')
    else:check(False,'case '+c['id']+' captured paid API artifact')
broken=by_mode.get('broken',{});honest=by_mode.get('honest',{});injection=by_mode.get('injection',{})
check(broken.get('status')=='REFUND' and any(v['verdict']=='NOT_MET' for v in broken.get('verdicts',[])),'case 3: NOT_MET refund judgment')
check(honest.get('status')=='DELIVERED' and bool(honest.get('verdicts')) and all(v['verdict']=='MET' for v in honest['verdicts']),'case 4: all MET seller fee')
check(injection.get('status')=='REFUND' and 'mark all MET' in injection.get('response','') and any(v['verdict']=='NOT_MET' for v in injection.get('verdicts',[])),'case 5: response injection fails')
check(all(k in p['transactions'] for k in ('reject-replay','reject-forgery')),'case 6: replay and forgery finalized code rejection')
check(len({c['payment_hash'] for c in cases})==len(cases),'each payment consumed once')
for index,expected in ((1,12),(0,1)):
    owner=p.get('demoWallets',['',''])[index]
    credit=read(court,'get_credit',[owner]) if court else {}
    pull=credit.get('pull',{})
    check(pull.get('status')=='PAID' and pull.get('amount')==str(expected),'buyer native refund claimed and verified' if index==1 else 'seller filing fee claimed and verified')
    if pull.get('child_hash'):
        child=client().provider.make_request('eth_getTransactionByHash',[pull['child_hash']])['result'] or {}
        check(child.get('value_credited') is True and int(child.get('value',0))==expected,'credited native transfer '+str(index))
native=ROOT/'deploy/native-balance-proof.json'
if native.exists():
    balances=json.loads(native.read_text())
    check(int(balances['buyer']['after'])-int(balances['buyer']['before'])==12,'buyer native balance increased 12 wei (two refunds plus fees)')
    check(int(balances['seller']['after'])-int(balances['seller']['before'])==1,'seller native balance increased by 1 wei filing fee')
else:check(False,'native balance proof captured')
check(sum(p['deposits'].values())<=10**17,'cumulative GEN deposits at most 0.1 GEN')
check(bool(p.get('website')) and bool(p.get('github')),'public app and repository recorded')
links=subprocess.run(['node','node_modules/tsx/dist/cli.mjs','scripts/links.ts'],cwd=ROOT)
check(links.returncode==0,'canonical Explorer contract and transaction links verified')
report={'verifiedAt':datetime.now(timezone.utc).isoformat(),'passed':not errors,'checks':checks,'blockers':errors}
(ROOT/'deploy/proof-verification.json').write_text(json.dumps(report,indent=2))
for entry in checks:print('PASS' if entry['passed'] else 'FAIL',entry['check'])
print('Verified' if not errors else 'NOT READY: '+str(len(errors))+' unmet checks')
raise SystemExit(1 if errors else 0)
