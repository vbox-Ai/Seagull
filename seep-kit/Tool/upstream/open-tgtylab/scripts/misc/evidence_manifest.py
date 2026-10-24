#!/usr/bin/env python3
"""Maintain a deduplicated evidence manifest for an OpenTgtyLab case."""
from __future__ import annotations
import argparse, hashlib, json
from datetime import datetime, timezone
from pathlib import Path

class EvidenceManifest:
 def __init__(self,path:str|Path,case_slug:str): self.path=Path(path).resolve(); self.case_slug=case_slug; self.base=self.path.parent.resolve()
 def load(self):
  if self.path.exists(): return json.loads(self.path.read_text(encoding='utf-8-sig'))
  return {'schema_version':'1.0','case':self.case_slug,'artifacts':[],'updated_at':None}
 def add(self,artifact:str|Path,tool:str,artifact_type:str='tool-output',finding_id:str='',metadata:dict|None=None):
  p=Path(artifact).resolve()
  try: rel=p.relative_to(self.base)
  except ValueError as e: raise ValueError('artifact must stay inside the case evidence directory') from e
  if not p.is_file(): raise FileNotFoundError(p)
  digest=hashlib.sha256(p.read_bytes()).hexdigest(); data=self.load()
  existing=next((x for x in data['artifacts'] if x.get('sha256')==digest and x.get('path')==rel.as_posix()),None)
  if existing: return existing
  item={'id':'ev-'+digest[:12],'type':artifact_type,'path':rel.as_posix(),'sha256':digest,'bytes':p.stat().st_size,'tool':tool,'finding_id':finding_id or None,'created_at':datetime.now(timezone.utc).isoformat(),'metadata':metadata or {}}
  data['artifacts'].append(item);data['updated_at']=datetime.now(timezone.utc).isoformat();self.path.parent.mkdir(parents=True,exist_ok=True);tmp=self.path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');tmp.replace(self.path);return item

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--manifest',required=True);ap.add_argument('--case',required=True);ap.add_argument('--artifact',required=True);ap.add_argument('--tool',required=True);ap.add_argument('--type',default='tool-output');ap.add_argument('--finding-id',default='');a=ap.parse_args();print(json.dumps(EvidenceManifest(a.manifest,a.case).add(a.artifact,a.tool,a.type,a.finding_id),ensure_ascii=False,indent=2))
if __name__=='__main__':main()
