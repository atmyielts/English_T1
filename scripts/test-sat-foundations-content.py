"""Local arithmetic/structure review of unpublished original content; no production access."""
import json
import math
from fractions import Fraction
from pathlib import Path

bank = json.loads(Path('content/sat-practice/original-foundations.json').read_text(encoding='utf-8'))
questions = {q['slug']: q for q in bank['questions']}
assert bank['status'] == 'reviewed_for_publication'
assert len(questions) == len(bank['questions']) == 27
domains = {}
for q in questions.values():
    assert len(q['options']) == len(set(q['options'])) == 4
    assert q['correctOption'] in 'ABCD' and len(q['correctOption']) == 1
    assert q['prompt'].strip() and q['explanation'].strip()
    domains.setdefault(q['domain'], set()).add(q['difficulty'])
assert len(domains) == 9 and all(levels == {'easy','medium','hard'} for levels in domains.values())

def linear_system(a,b,c,d,e,f):
    determinant = a*e-b*d
    return Fraction(c*e-b*f,determinant), Fraction(a*f-c*d,determinant)

x,y = linear_system(3,2,21,1,-1,2)
root1,root2 = (6+math.sqrt(20))/2, (6-math.sqrt(20))/2
expected = {
    'algebra-easy-linear-equation': Fraction(17+7,4),
    'algebra-medium-system': x+y,
    'algebra-hard-dependent-system': Fraction(2*6,3),
    'advanced-easy-quadratic-roots': (5+math.sqrt(5**2-4*6))/2,
    'advanced-medium-exponential-growth': 120*Fraction(5,4)**2,
    'advanced-hard-root-expression': root1**2+root2**2,
    'data-easy-proportion': Fraction(35,100)*80,
    'data-medium-combined-mean': Fraction(4*12+6*17,4+6),
    'data-hard-conditional-probability': Fraction(18,18+8),
    'geometry-easy-triangle-area': Fraction(12*7,2),
    'geometry-medium-trigonometric-ratio': math.sin(math.atan2(5,12)),
    'geometry-hard-circle-tangent': math.sqrt(10**2-6**2),
}
checks=[]
for slug,value in expected.items():
    q=questions[slug]
    numeric=[float(Fraction(option)) for option in q['options']]
    matches=[i for i,option in enumerate(numeric) if math.isclose(option,float(value),rel_tol=1e-12)]
    assert matches == ['ABCD'.index(q['correctOption'])], slug
    checks.append({'slug':slug,'singleCorrectChoice':True,'calculationVerified':True})

report={'questionCount':27,'domains':9,'editorialTiersPerDomain':3,'mathChoicesVerified':checks,
        'structureVerified':True,'published':False,
        'limits':['RW semantic review is separate from this arithmetic check',
                  'Editorial difficulty is not empirical calibration',
                  'Database publication, private feedback and browser delivery remain unqualified']}
Path('supabase/.temp/sat-foundations').mkdir(parents=True,exist_ok=True)
Path('supabase/.temp/sat-foundations/content-proof.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('Reviewed foundations: 27 structured items, nine domains, 12 independently calculated Math keys verified.')
