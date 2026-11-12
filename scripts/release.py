"""Resumable stages. Never approves a deposit or invents a payment receipt."""
import hashlib
import json
import sys
from datetime import datetime,timezone
from chain import ROOT,load,save,tx,read,accounts

p=load()
stage=sys.argv[1] if len(sys.argv)>1 else 'record'
def address(name):return p['contracts'][name]['address']

if stage=='deploy':
    if not any(x.get('reachable') for x in p.get('probes',{}).values()):raise RuntimeError('Validator Base RPC probe must pass first')
    for name,filename in [('ServicePromise','service_promise.py'),('RefundCourt','refund_court.py')]:
        source=(ROOT/'contracts'/filename).read_text()
        digest=hashlib.sha256(source.encode()).hexdigest()
        if name in p['contracts']:
            if p['contracts'][name]['sha256']!=digest:raise RuntimeError('Source changed since deployment; use a new release manifest')
            continue
        r=tx(p,'deploy-'+name,code=source,args=[] if name=='ServicePromise' else [address('ServicePromise')])
        p['contracts'][name]={'address':r.get('recipient',r.get('to_address')),'source':filename,'sha256':digest}
        save(p)
elif stage=='compile':
    base=p['website'].rstrip('/')
    for mode,promise in [('subjective','Returns the most beautiful and delightful weather report in the world.'),('honest','Returns a demo weather report for the requested city, temperature in Celsius, with observed_at no older than one hour before delivered_at.'),('broken','Returns a demo weather report for the requested city, temperature in Celsius, with observed_at no older than one hour before delivered_at.'),('injection','Returns a demo weather report for the requested city, temperature in Celsius, with observed_at no older than one hour before delivered_at.')]:
        tx(p,'compile-'+mode,address('ServicePromise'),'register',[base+'/api/weather/'+('honest' if mode=='subjective' else mode),promise,1000,5])
    print('Compilation finalized. Run record.',flush=True)
elif stage=='bond':
    for key in read(address('ServicePromise'),'get_ids',[0,50]):
        service=read(address('ServicePromise'),'get_service',[key])
        if service['status']!='FROZEN':continue
        tx(p,'prepare-'+key,address('RefundCourt'),'prepare_bond',[key])
        tx(p,'bond-'+key,address('RefundCourt'),'deposit_bond',[key],value=20)
elif stage=='file':
    mode=sys.argv[2]
    artifact=json.loads((ROOT/'deploy/payments'/(mode+'.json')).read_text())
    service=next(s for s in p['services'] if s['endpoint'].endswith('/'+mode) and s['status']=='FROZEN')
    args=[service['id'],artifact['payment_hash'],artifact['request'],artifact['response'],artifact['signature']]
    tx(p,'reserve-'+mode,address('RefundCourt'),'reserve_claim',args,index=1)
    ids=read(address('RefundCourt'),'get_ids',[0,50])
    cid=next(k for k in ids if read(address('RefundCourt'),'get_case',[k])['payment_hash']==artifact['payment_hash'])
    p.setdefault('caseIds',{})[mode]=cid;save(p)
    tx(p,'fee-'+mode,address('RefundCourt'),'deposit_fee',[cid],index=1,value=1)
    tx(p,'judge-'+mode,address('RefundCourt'),'judge_claim',[cid],index=1)
elif stage=='reject':
    a=json.loads((ROOT/'deploy/payments/broken.json').read_text())
    service=next(s for s in p['services'] if s['endpoint'].endswith('/broken') and s['status']=='FROZEN')
    args=[service['id'],a['payment_hash'],a['request'],a['response'],a['signature']]
    r=tx(p,'reject-replay',address('RefundCourt'),'reserve_claim',args,index=1,allow_error=True)
    if not r or r.get('txExecutionResultName')=='SUCCESS':raise RuntimeError('Replay unexpectedly succeeded')
    forged=[service['id'],'0x'+'dd'*32,a['request'],a['response']+' ',a['signature']]
    tx(p,'reject-forgery',address('RefundCourt'),'reserve_claim',forged,index=1,allow_error=True)
elif stage=='pull':
    index=int(sys.argv[2]);owner=accounts()[index].address
    credit=read(address('RefundCourt'),'get_credit',[owner])
    attempt=credit.get('pull',{}).get('attempt',0)+1
    label='pull-'+str(index)+'-'+str(attempt)
    r=tx(p,label,address('RefundCourt'),'claim',[attempt],index=index)
    child=(r.get('triggered_transactions') or [None])[0]
    if not child:raise RuntimeError('No native transfer emitted')
    tx(p,'verify-'+label,address('RefundCourt'),'verify_claim',[owner,attempt,p['transactions'][label],child])
elif stage!='record':raise SystemExit('Unknown stage')

if p.get('contracts') and len(p['contracts'])==2:
    p['services']=[read(address('ServicePromise'),'get_service',[key]) for key in read(address('ServicePromise'),'get_ids',[0,50])]
    p['bonds']={s['id']:read(address('RefundCourt'),'get_bond',[s['id']]) for s in p['services']}
    p['claimCases']=[read(address('RefundCourt'),'get_case',[key]) for key in read(address('RefundCourt'),'get_ids',[0,50])]
    p['credits']={a.address:read(address('RefundCourt'),'get_credit',[a.address]) for a in accounts()}
    p['recordedAt']=datetime.now(timezone.utc).isoformat()
    save(p)
