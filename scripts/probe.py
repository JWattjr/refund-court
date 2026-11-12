import hashlib
from chain import ROOT, load, save, tx, read, accounts

p = load()
p['demoWallets'] = [a.address for a in accounts()]
if not p.get('probeContract'):
    source = (ROOT / 'contracts/access_probe.py').read_text()
    r = tx(p,'probe-deploy',code=source)
    p['probeContract'] = r.get('recipient',r.get('to_address'))
    p['probeSourceSha256'] = hashlib.sha256(source.encode()).hexdigest()
    save(p)
for i,url in enumerate(('https://sepolia.base.org','https://base-sepolia-rpc.publicnode.com')):
    if url in p.get('probes',{}): continue
    tx(p,'probe-base-'+str(i),p['probeContract'],'probe',[url])
    p.setdefault('probes',{})[url] = read(p['probeContract'],'result',[url])
    save(p)
    print(url,p['probes'][url],flush=True)
