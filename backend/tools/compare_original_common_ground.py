"""Replay original prompt constants verbatim with one shared complete evidence pack.

Four calls, two per original mode. No application or database changes. Prompt source
is read from an explicit Git revision, never checked out or executed.
"""
import argparse
import ast
import asyncio
from copy import deepcopy
import inspect
import json
import os
from pathlib import Path
import subprocess
import time

from dotenv import dotenv_values
from openai import OpenAI

from backend.app.analysis import AnalysisService, _language_rule
from backend.app.model_routing import model_request
from backend.tools.compare_common_ground_framing import evidence_pack
from backend.tools.compare_common_ground_modes import render
from backend.tools.compare_report_models import digest, source_hashes, write_json


def original_prompts(ref, language):
    commit = subprocess.check_output(['git','rev-parse','--verify',ref+'^{commit}'],text=True).strip()
    code = subprocess.check_output(['git','show',commit+':backend/app/analysis.py'],text=True)
    tree = ast.parse(code)
    values = {}
    def constant(node):
        if isinstance(node,ast.Constant): return node.value
        if isinstance(node,ast.Name): return values[node.id]
        if isinstance(node,ast.BinOp) and isinstance(node.op,ast.Add): return constant(node.left)+constant(node.right)
        if isinstance(node,ast.Dict): return {constant(k):constant(v) for k,v in zip(node.keys,node.values)}
        raise ValueError('Prompt must be composed only of constants')
    for node in tree.body:
        if isinstance(node,ast.Assign) and isinstance(node.targets[0],ast.Name):
            name=node.targets[0].id
            if name in ('COMMON_GROUND_BASE','COMMON_GROUND_PROMPTS','LANGUAGE_LABELS'):
                values[name]=constant(node.value)
    old_rule = next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_language_rule')
    current_rule = ast.parse(inspect.getsource(_language_rule)).body[0]
    assert ast.dump(old_rule)==ast.dump(current_rule), 'Language rule changed; inspect before replay'
    old_languages = subprocess.check_output(['git','show',commit+':backend/app/languages.py'],text=True)
    assert old_languages == Path('backend/app/languages.py').read_text(), 'Language definitions changed'
    prompts={arm:values['COMMON_GROUND_PROMPTS'][arm]+_language_rule(language) for arm in ('generic','policy')}
    assert '3-4 sentence mediation summary' in prompts['policy']
    assert 'do NOT pitch this as a working policy proposal or draft' in prompts['policy']
    return commit,code,prompts


def prepare(source, report, ref):
    evidence=evidence_pack(source,report)
    commit,code,prompts=original_prompts(ref,evidence['language'])
    user=json.dumps(evidence,ensure_ascii=False,sort_keys=True)
    requests={arm:{**model_request('common-ground'),'response_format':{'type':'json_object'},
                   'messages':[{'role':'system','content':prompt},{'role':'user','content':user}]}
              for arm,prompt in prompts.items()}
    left,right=[deepcopy(requests[a]) for a in ('generic','policy')]
    for request in (left,right): request['messages'][0]['content']='<ORIGINAL_MODE_PROMPT>'
    assert left==right, 'Only original system prompts may differ'
    return {'topic':evidence['topic'],'evidence':evidence,'evidenceHash':digest(evidence),
            'promptCommit':commit,'promptSourceHash':digest(code),'promptHashes':{a:digest(p) for a,p in prompts.items()},
            'requests':requests,'sourceHashes':source_hashes(),'toolHash':digest(Path(__file__).read_text()),
            'inputHash':digest(source),'reportHash':digest(report),
            'labels':{'generic':'Generic · original instructions','policy':'Policy · original instructions'},
            'intro':'Original instructions and output structures, copied verbatim from saved revision '+commit[:7]+'. Both receive exactly the same complete evidence and group descriptions, with identical Astra settings. Policy retains its 3–4 sentence mediation summary. No added writing rules or common length limits. Two runs per mode; no host preferences added. Local experiment only.'}


async def run(args):
    os.umask(0o077)
    source=json.loads(args.input.read_text());report=json.loads(args.report.read_text())
    bundle=prepare(source,report,args.prompt_ref)
    key=dotenv_values(args.key_file).get('OPENAI_API_KEY')
    if not key: raise ValueError('Missing explicit experiment key')
    dest=args.output;dest.mkdir(parents=True,mode=0o700,exist_ok=False)
    write_json(dest/'bundle.json',bundle);render(dest)
    client=OpenAI(api_key=key,base_url='https://api.openai.com/v1',timeout=90,max_retries=0)
    service=AnalysisService.__new__(AnalysisService)
    async def one(arm,repeat):
        path=dest/f'{arm}-{repeat}.json';request=bundle['requests'][arm]
        result={'status':'started','requestHash':digest(request)}
        write_json(path,result);start=time.monotonic()
        try:
            response=await asyncio.to_thread(client.chat.completions.create,**request)
            result['response']=response.model_dump();choice=response.choices[0]
            if choice.finish_reason!='stop' or getattr(choice.message,'refusal',None): result['status']='incomplete'
            else:
                raw=json.loads(choice.message.content);result['raw']=raw
                # Preserve original mode output, without later concise/profile replacement rules.
                result['normalized']=service._normalize_common_ground(raw,arm,{k:v for k,v in source['evidence'].items() if k != 'groupProfiles'},validate=False,language=bundle['evidence']['language'])
                result['status']='structure accepted' if result['normalized'] else 'structure rejected'
        except Exception as exc: result.update(status='error',errorType=type(exc).__name__)
        result['seconds']=round(time.monotonic()-start,2)
        write_json(path,result);render(dest)
        print(f'{arm} {repeat+1}: {result["status"]}',flush=True)
    try:
        for repeat,order in enumerate([('generic','policy'),('policy','generic')]):
            await asyncio.gather(*(one(arm,repeat) for arm in order))
    finally: client.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('input','report','output','key-file'): parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--prompt-ref',required=True)
    asyncio.run(run(parser.parse_args()))
