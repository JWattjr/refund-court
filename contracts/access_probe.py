# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
from genlayer import *

class BasePaymentProbe(gl.Contract):
    observations: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.write
    def probe(self, endpoint: str) -> None:
        if endpoint not in ('https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'):
            raise gl.vm.UserError('Unapproved public RPC')
        def fetch():
            try:
                r = gl.nondet.web.post(endpoint, body=b'{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}', headers={'Content-Type':'application/json','User-Agent':'Mozilla/5.0 RefundCourt/1.0'})
                data = json.loads(r.body.decode('utf8'))
                return {'reachable': r.status == 200 and data.get('result') == '0x14a34', 'status': r.status, 'chainId': data.get('result','')}
            except Exception:
                return {'reachable':False, 'status':0, 'chainId':''}
        def validate(result):
            return isinstance(result, gl.vm.Return) and fetch()['reachable'] == result.calldata['reachable']
        self.observations[endpoint] = json.dumps(gl.vm.run_nondet_unsafe(fetch, validate), sort_keys=True)

    @gl.public.view
    def result(self, endpoint: str) -> str:
        return self.observations.get(endpoint, '{}')
