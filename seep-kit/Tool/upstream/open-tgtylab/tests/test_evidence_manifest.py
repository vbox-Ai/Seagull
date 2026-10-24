import json
from pathlib import Path
from scripts.misc.evidence_manifest import EvidenceManifest


def test_manifest_add_dedup_and_link_finding(tmp_path):
    base=tmp_path/'exports'/'evidence'/'demo'; base.mkdir(parents=True)
    artifact=base/'request.txt'; artifact.write_text('GET /users/2',encoding='utf-8')
    m=EvidenceManifest(base/'manifest.json','demo')
    one=m.add(artifact,tool='hunter_auto_idor',artifact_type='http-request',finding_id='idor-1')
    two=m.add(artifact,tool='hunter_auto_idor',artifact_type='http-request',finding_id='idor-1')
    assert one['id']==two['id']; assert len(m.load()['artifacts'])==1
    assert m.load()['artifacts'][0]['sha256']

def test_manifest_rejects_artifact_outside_case(tmp_path):
    base=tmp_path/'case';base.mkdir(); outside=tmp_path/'secret';outside.write_text('x')
    m=EvidenceManifest(base/'manifest.json','demo')
    try: m.add(outside,tool='x')
    except ValueError: pass
    else: raise AssertionError('expected traversal rejection')
