import json
import sys
from datetime import datetime,timezone
from chain import ROOT,client,accounts,load

stage=sys.argv[1];path=ROOT/'deploy/native-balance-proof.json'
p=json.loads(path.read_text()) if path.exists() else {}
if stage not in ('before','after'):raise SystemExit('Choose before or after')
if stage=='before' and p.get('beforeAt'):raise SystemExit('Before-pull balances already captured; refusing to overwrite the baseline')
owners=[('buyer',accounts()[1].address),('seller',accounts()[0].address),('court',load()['contracts']['RefundCourt']['address'])]
for name,owner in owners:
    r=client().provider.make_request('eth_getBalance',[owner,'latest'])['result']
    p.setdefault(name,{'address':owner})[stage]=str(int(r,16))
    print(name,stage,p[name][stage],flush=True)
p[stage+'At']=datetime.now(timezone.utc).isoformat()
path.write_text(json.dumps(p,indent=2))
