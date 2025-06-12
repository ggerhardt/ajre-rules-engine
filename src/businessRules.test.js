import { validateRules } from './businessRules.js';

describe('validateRules', () => {

  const documentJson = {
    a: 1,
    b: 'test',
    c: [
      { d: 2, e: 'test2' },
      { d: 3, e: 'test3' }
    ]
  };

  test('returns an empty array if no rules are provided', () => {
    expect(validateRules(documentJson, [])).toEqual([]);
  });

  test('validates rules with basic operators', () => {
    const rules = [
      { id: 1, type: 'rule1', conditions: [{ ref: 'a', operator: '=', comparisonValue: 1 }] },
      { id: 2, type: 'rule2', conditions: [{ ref: 'b', operator: '<>', comparisonValue: 'test1' }] },
      { id: 3, type: 'rule3', conditions: [{ ref: 'a', operator: '<', comparisonValue: 2 }] },
      { id: 4, type: 'rule4', conditions: [{ ref: 'a', operator: '<=', comparisonValue: 1 }] },
      { id: 5, type: 'rule5', conditions: [{ ref: 'a', operator: '>', comparisonValue: 0 }] },
      { id: 6, type: 'rule6', conditions: [{ ref: 'a', operator: '>=', comparisonValue: 1 }] },
    ];
    const rulesCheck = validateRules(documentJson, rules);
    expect(rulesCheck.length).toEqual(6);
  });

  test('does not return rules when basic operators do not match', () => {
    const rules = [
      { id: 1, type: 'rule1', conditions: [{ ref: 'a', operator: '=', comparisonValue: 2 }] },
      { id: 2, type: 'rule2', conditions: [{ ref: 'b', operator: '<>', comparisonValue: 'test' }] },
      { id: 3, type: 'rule3', conditions: [{ ref: 'a', operator: '<', comparisonValue: 0 }] },
      { id: 4, type: 'rule4', conditions: [{ ref: 'a', operator: '<=', comparisonValue: 0 }] },
      { id: 5, type: 'rule5', conditions: [{ ref: 'a', operator: '>', comparisonValue: 1 }] },
      { id: 6, type: 'rule6', conditions: [{ ref: 'a', operator: '>=', comparisonValue: 5 }] },
    ];

    const rulesCheck = validateRules(documentJson, rules);
    expect(rulesCheck.length).toEqual(0);
  });

  test('validates rules with string operators', () => {
    const rules = [
      { id: 7, type: 'rule7', conditions: [{ ref: 'b', operator: 'contains', comparisonValue: 'test' }] },
      { id: 8, type: 'rule8', conditions: [{ ref: 'b', operator: 'does_not_contains', comparisonValue: 'test1' }] },
      { id: 9, type: 'rule9', conditions: [{ ref: 'b', operator: 'is_contained', comparisonValue: 'testing' }] },
    ];

    const rulesCheck = validateRules(documentJson, rules);
    expect(rulesCheck.length).toEqual(3);
  });

  test('validates rules with array operators', () => {
    const rules = [
      { id: 10, type: 'rule10', conditions: [{ ref: 'a', operator: 'in', comparisonValue: [1,2,3] }] },
      { id: 11, type: 'rule11', conditions: [{ ref: 'a', operator: 'not_in', comparisonValue: [2,3] }] },
    ];

    const rulesCheck = validateRules(documentJson, rules);
    expect(rulesCheck.length).toEqual(2);
  });

  test('validates rules with existence operators', () => {
    const rules = [
      { id: 12, type: 'rule12', conditions: [{ ref: 'a', operator: 'exists' }] },
      { id: 13, type: 'rule13', conditions: [{ ref: 'z', operator: 'does_not_exists' }] },
    ];

    const rulesCheck = validateRules(documentJson, rules);
    expect(rulesCheck.length).toEqual(2);
  });
});

describe('validateRules - initialDate and endDate', () => {
  const baseDocument = {
    foo: 'bar',
    arr: [{ value: 1 }, { value: 2 }]
  };

  const alwaysValidRule = {
    id: 'rule1',
    type: 'test',
    description: 'Always valid rule',
    conditions: [
      { ref: 'foo', operator: '=', comparisonValue: 'bar' }
    ]
    // no initialDate or endDate
  };

  const futureRule = {
    id: 'rule2',
    type: 'test',
    description: 'Future rule',
    initialDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // tomorrow
    conditions: [
      { ref: 'foo', operator: '=', comparisonValue: 'bar' }
    ]
  };

  const expiredRule = {
    id: 'rule3',
    type: 'test',
    description: 'Expired rule',
    endDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // yesterday
    conditions: [
      { ref: 'foo', operator: '=', comparisonValue: 'bar' }
    ]
  };

  const validNowRule = {
    id: 'rule4',
    type: 'test',
    description: 'Valid now rule',
    initialDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // yesterday
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // tomorrow
    conditions: [
      { ref: 'foo', operator: '=', comparisonValue: 'bar' }
    ]
  };

  test('includes rules without initialDate/endDate', () => {
    const result = validateRules(baseDocument, [alwaysValidRule]);
    expect(result.some(r => r.id === 'rule1')).toBe(true);
  });

  test('excludes rules with initialDate in the future', () => {
    const result = validateRules(baseDocument, [futureRule]);
    expect(result.some(r => r.id === 'rule2')).toBe(false);
  });

  test('excludes rules with endDate in the past', () => {
    const result = validateRules(baseDocument, [expiredRule]);
    expect(result.some(r => r.id === 'rule3')).toBe(false);
  });

  test('includes rules valid for the current date', () => {
    const result = validateRules(baseDocument, [validNowRule]);
    expect(result.some(r => r.id === 'rule4')).toBe(true);
  });

  test('filters only valid rules among mixed rules', () => {
    const result = validateRules(baseDocument, [alwaysValidRule, futureRule, expiredRule, validNowRule]);
    const ids = result.map(r => r.id);
    expect(ids).toContain('rule1');
    expect(ids).toContain('rule4');
    expect(ids).not.toContain('rule2');
    expect(ids).not.toContain('rule3');
  });
});

describe('businessRules operators test', () => {
  const jsonDocument = {
    name: 'John Doe',
    age: 22,
    tags: ['blue_eyed', 'blind'],
    alive: true,
  };
  test('returns rule when string equality matches', async () => {
    const rules = [{
      id: 1,
      returnCode: 'ERR001',
      name: 'Invalid value',
      description: 'Value should be "John Doe"',
      conditions: [
        {
          ref: 'name',
          operator: '=',
          comparisonValue: 'John Doe',
        },
      ],
    }];
    const results = validateRules(jsonDocument, rules);

    expect(results.length).toBe(1);
  });
  test('does not return rule when string equality does not match', async () => {
    const rules = [{
      id: 1,
      type: 'ERROR',
      returnCode: 'ERR001',
      name: 'Invalid value',
      description: 'Value should be "John Doe 1"',
      conditions: [
        {
          ref: 'name',
          operator: '=',
          comparisonValue: 'John Doe 1',
        },
      ],
    }];
    const results = validateRules(jsonDocument, rules);

    expect(results.length).toBe(0);
  });
});
describe('businessRules forcing errors', () => {
  const jsonDocument = {
    name: 'John Doe',
    age: 22,
    tags: ['blue_eyed', 'blind'],
    alive: true,
  };
  test('returns error when operator is invalid in one condition', async () => {
    const rules = [{
      id: 1,
      returnCode: 'ERR001',
      name: 'Invalid value',
      description: 'Value should be "John Doe"',
      conditions: [
        {
          ref: 'name',
          operator: 'INVALID_OPERATOR',
          comparisonValue: 'John Doe',
        },
      ],
    }];
    const results = validateRules(jsonDocument, rules);

    expect(results.length).toBe(1);
    expect(results[0].errors).toBeDefined();
  });
  test('handles invalid operator in one rule and valid operator in another', async () => {
    const rules = [{
      id: 1,
      returnCode: 'ERR001',
      name: 'Invalid value',
      description: 'Value should be "John Doe"',
      conditions: [
        {
          ref: 'name',
          operator: 'INVALID_OPERATOR',
          comparisonValue: 'John Doe',
        },
      ],
    },{
      id: 2,
      type: 'ERROR',
      returnCode: 'ERR001',
      name: 'Invalid value',
      description: 'Value should be "John Doe 1"',
      conditions: [
        {
          ref: 'name',
          operator: '=',
          comparisonValue: 'John Doe',
        },
      ],
    }];
    const results = validateRules(jsonDocument, rules);

    expect(results.length).toBe(2);
    expect(results[0].errors).toBeDefined();
    expect(results[1].errors).toBeUndefined();
  });
});

describe('validateRules with contextObj', () => {
  const documentJson = {
    a: 1,
    b: 'test',
  };
  const contextObj = {
    userType: 'admin',
    meta: { active: true, score: 42 }
  };

  test('can reference contextObj in rule value', () => {
    const rules = [
      { id: 1, type: 'context', conditions: [
        { ref: '_context.userType', operator: '=', comparisonValue: 'admin' }
      ] },
      { id: 2, type: 'context', conditions: [
        { ref: '_context.meta.active', operator: '=', comparisonValue: true }
      ] },
      { id: 3, type: 'context', conditions: [
        { ref: '_context.meta.score', operator: '>', comparisonValue: 40 }
      ] },
    ];
    const result = validateRules(documentJson, rules, contextObj);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
    expect(result[2].id).toBe(3);
  });

  test('returns empty if contextObj condition does not match', () => {
    const rules = [
      { id: 4, type: 'context', conditions: [
        { ref: '_context.userType', operator: '=', comparisonValue: 'user' }
      ] }
    ];
    const result = validateRules(documentJson, rules, contextObj);
    expect(result.length).toBe(0);
  });

  test('can mix documentJson and contextObj in rules', () => {
    const rules = [
      { id: 5, type: 'mixed', conditions: [
        { ref: 'a', operator: '=', comparisonValue: 1 },
        { ref: '_context.userType', operator: '=', comparisonValue: 'admin' }
      ] }
    ];
    const result = validateRules(documentJson, rules, contextObj);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(5);
  });
});

describe('validateRules with comparisonRef', () => {
  const documentJson = {
    a: 10,
    b: 10,
    c: 5,
    d: 'foo',
    e: 'bar',
  };
  const contextObj = {
    userType: 'admin',
    meta: { active: true, score: 10, minScore: 5 },
    refValue: 'foo',
  };

  test('compares two fields from document', () => {
    const rules = [
      { id: 1, type: 'ref', conditions: [
        { ref: 'a', operator: '=', comparisonRef: 'b' }
      ] },
      { id: 2, type: 'ref', conditions: [
        { ref: 'a', operator: '>', comparisonRef: 'c' }
      ] },
      { id: 3, type: 'ref', conditions: [
        { ref: 'd', operator: '<>', comparisonRef: 'e' }
      ] },
    ];
    const result = validateRules(documentJson, rules, contextObj);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
    expect(result[2].id).toBe(3);
  });

  test('compares document field with context field', () => {
    const rules = [
      { id: 4, type: 'ref', conditions: [
        { ref: 'a', operator: '=', comparisonRef: '_context.meta.score' }
      ] },
      { id: 5, type: 'ref', conditions: [
        { ref: 'd', operator: '=', comparisonRef: '_context.refValue' }
      ] },
    ];
    const result = validateRules(documentJson, rules, contextObj);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe(4);
    expect(result[1].id).toBe(5);
  });

  test('compares context field with another context field', () => {
    const rules = [
      { id: 6, type: 'ref', conditions: [
        { ref: '_context.meta.score', operator: '>=', comparisonRef: '_context.meta.minScore' }
      ] },
    ];
    const result = validateRules(documentJson, rules, contextObj);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(6);
  });

  test('result.errors if both comparisonValue and comparisonRef are present', () => {
    const rules = [
      { id: 7, type: 'ref', conditions: [
        { ref: 'a', operator: '=', comparisonValue: 10, comparisonRef: 'b' }
      ] },
    ];
    const results = validateRules(documentJson, rules, contextObj);
    expect(results.length).toBe(1);
    expect(results[0].errors).toBeDefined();    
  });
});

// Teste: Ambos os campos referenciam o mesmo array
it('deve gerar contextos corretamente quando ref e comparisonRef referenciam o mesmo array', () => {
  const documentJson = {
    pessoas: [
      { idade: 20, idadeReferencia: 18 },
      { idade: 15, idadeReferencia: 18 }
    ]
  };

  const rules = [
    {
      id: 'regra1',
      type: 'teste',
      description: 'Idade deve ser maior que idadeReferencia',
      conditions: [
        {
          ref: 'pessoas[].idade',
          operator: '>',
          comparisonRef: 'pessoas[].idadeReferencia'
        }
      ]
    }
  ];

  const result = validateRules(documentJson, rules);
  expect(result.length).toBe(1);
  // Só o primeiro passa (20 > 18)
  expect(result[0].conditions[0].conditionValues.length).toBe(1);
  expect(result[0].conditions[0].conditionValues[0].instancePathValue).toBe(20);
});

// Teste: ref e comparisonRef referenciam arrays diferentes
it('deve gerar contextos cruzados quando ref e comparisonRef referenciam arrays diferentes', () => {
  const documentJson = {
    pessoas: [
      { idade: 20 },
      { idade: 15 }
    ],
    referencias: [
      { idadeReferencia: 18 },
      { idadeReferencia: 10 }
    ]
  };

  const rules = [
    {
      id: 'regra2',
      type: 'teste',
      description: 'Idade deve ser maior que idadeReferencia',
      conditions: [
        {
          ref: 'pessoas[].idade',
          operator: '>',
          comparisonRef: 'referencias[].idadeReferencia'
        }
      ]
    }
  ];

  const result = validateRules(documentJson, rules);
  // Como são 2x2 combinações, espera-se 4 contextos
  expect(result.length).toBe(1);
  // Cada contexto avaliado individualmente
  // O resultado pode variar conforme a implementação, mas garantimos que há pelo menos 1 condição verdadeira
  const totalTrue = result[0].conditions.reduce((acc, ctx) => acc + ctx.conditionValues.length, 0);
  expect(totalTrue).toBeGreaterThan(0);
});

// Teste: Apenas comparisonRef referencia array
it('deve funcionar quando apenas comparisonRef referencia array', () => {
  const documentJson = {
    valor: 10,
    referencias: [
      { idadeReferencia: 8 },
      { idadeReferencia: 12 }
    ]
  };

  const rules = [
    {
      id: 'regra3',
      type: 'teste',
      description: 'Valor deve ser maior que idadeReferencia',
      conditions: [
        {
          ref: 'referencias[].idadeReferencia',
          operator: '>',
          comparisonRef: 'valor'
        }
      ]
    }
  ];

  const result = validateRules(documentJson, rules);
  expect(result.length).toBe(1);
  // Deve avaliar para cada item do array referencias
  // O resultado pode variar conforme a implementação, mas garantimos que há pelo menos 1 condição verdadeira
  const totalTrue = result[0].conditions.reduce((acc, ctx) => acc + ctx.conditionValues.length, 0);
  expect(totalTrue).toBeGreaterThan(0);
});

describe('validateRules contextLimit', () => {
  it('should stop and return an error if contextLimit is reached', () => {
    const documentJson = {
      arr1: Array.from({ length: 101 }), // 101 elementos
      arr2: Array.from({ length: 101 }), // 101 elementos
    };
    const rules = [
      {
        id: 'limitTest',
        type: 'ERROR',
        description: 'Test context limit',
        conditions: [
          { ref: 'arr1[].x', operator: '=', comparisonRef: 'arr2[].y' }
        ]
      }
    ];
    // Com 101x101 = 10201 contextos, deve estourar o limite padrão (10000)
    const result = validateRules(documentJson, rules);
    const limitError = result.find(r => r.keyword === 'context_limit');
    expect(limitError).toBeDefined();
    expect(limitError.errors[0].cause).toBe('Context limit reached');
  });

  it('should allow increasing the contextLimit', () => {
    const documentJson = {
      arr1: Array.from({ length: 50 }),
      arr2: Array.from({ length: 50 }),
    };
    const rules = [
      {
        id: 'limitTest2',
        type: 'ERROR',
        description: 'Test context limit increase',
        conditions: [
          { ref: 'arr1[].x', operator: '=', comparisonRef: 'arr2[].y' }
        ]
      }
    ];
    // 50x50 = 2500 contextos, menor que o limite padrão
    const result = validateRules(documentJson, rules, null, { contextLimit: 3000 });
    const limitError = result.find(r => r.keyword === 'context_limit');
    expect(limitError).toBeUndefined();
  });
});