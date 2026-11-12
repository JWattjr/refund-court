"""Install only the generated, dedicated testnet seller key. Never print it."""
import json
import subprocess
from pathlib import Path
from chain import ROOT,accounts

key='0x'+accounts()[0].key.hex().removeprefix('0x')
local=ROOT/'.env.local'
lines=[line for line in local.read_text().splitlines() if not line.startswith('SELLER_PRIVATE_KEY=')] if local.exists() else []
local.write_text('\n'.join(lines+['SELLER_PRIVATE_KEY='+key])+'\n')
result=subprocess.run(['powershell','-NoProfile','-Command','vercel env add SELLER_PRIVATE_KEY production --sensitive --scope wattxs-projects'],input=key,text=True,capture_output=True,cwd=ROOT)
print(result.stdout)
print(result.stderr)
raise SystemExit(result.returncode)
