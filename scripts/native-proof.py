import json
import sys
from datetime import datetime,timezone
from chain import ROOT,client,accounts

stage=sys.argv[1];path=ROOT/'deploy/native-balance-proof.json'
p=json.loads(path.read_text()) if path.exists() else {}
if stage not in ('before','after'):raise SystemExit('Choose before or after')
for index,name in ((1,'buyer'),(0,'seller')):
    owner=accounts()[index].address
    r=client().provider.make_request('eth_getBalance',[owner,'latest'])['result']
    p.setdefault(name,{'address':owner})[stage]=str(int(r,16))
    print(name,stage,p[name][stage],flush=True)
p[stage+'At']=datetime.now(timezone.utc).isoformat()
path.write_text(json.dumps(p,indent=2))
