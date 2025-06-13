# Ajre Json Rules Engine 

A flexible, generic rules engine for JSON objects. Supports complex conditions, array traversal, date-based rule activation, and a wide range of operators. Works in both Node.js and browser environments.


## Installation

```bash
npm install another-json-rules-engine
```

## Usage Example

### Importing

#### ES Modules (import)
```js
import { validateRules } from 'another-json-rules-engine';
```

#### CommonJS (require)
```js
const { validateRules } = require('another-json-rules-engine');
```

### Example

```js
const document = {
  name: 'John Doe',
  age: 22,
  tags: ['blue_eyed', 'blind'],
  alive: true,
  score: 10,
  minScore: 5,
};

const contextObj = {
  userType: 'admin',
  meta: { active: true, score: 10, minScore: 5 },
  refValue: 'foo',
};

const rules = [
  // Fixed value comparison
  {
    id: 1,
    type: 'ERROR',
    description: 'Age must be greater than 18',
    conditions: [
      { ref: 'age', operator: '<', comparisonValue: 18 }
    ]
  },
  // Compare two fields from document
  {
    id: 2,
    type: 'REF',
    description: 'Score must be equal to minScore',
    conditions: [
      { ref: 'score', operator: '<>', comparisonRef: 'minScore' }
    ]
  },
  // Compare document field with context field
  {
    id: 3,
    type: 'CTX',
    description: 'Score must be equal to context meta.score',
    conditions: [
      { ref: 'score', operator: '<>', comparisonRef: '_context.meta.score' }
    ]
  },
  // Compare two fields from context
  {
    id: 4,
    type: 'CTX',
    description: 'Context meta.score must be >= context meta.minScore',
    conditions: [
      { ref: '_context.meta.score', operator: '<', comparisonRef: '_context.meta.minScore' }
    ]
  },
  // Use contextObj directly
  {
    id: 5,
    type: 'CTX',
    description: 'User type must be admin',
    conditions: [
      { ref: '_context.userType', operator: '<>', comparisonValue: 'admin' }
    ]
  }
];

const result = validateRules(document, rules, contextObj);
console.log(result);
```

## API: validateRules(documentJson, rules, contextObj = null, options = {})

### Return value

The function returns an array of rules for which **all conditions were satisfied** (that is, all conditions returned true for the given document/context). If a rule does not have all its conditions satisfied, it will not appear in the result.

### Parameters

- **documentJson**:  
  The JSON object to be validated.

- **rules**:  
  Array of rules in the format described in the "Rule Format" section.

- **contextObj** (optional):  
  Additional context object. Allows using references like `_context.path` in conditions.

- **options** (optional):  
  Configuration object with the following attributes:
  - **contextLimit**: Maximum number of contexts (array combinations) allowed per rule.  
    *Default: 10000*
  - **timeLimit**: Maximum time (in seconds) for context generation per rule.  
    *Default: 200*

  **Example:**
  ```js
  const result = validateRules(document, rules, contextObj, { contextLimit: 5000, timeLimit: 60 });
  ```

---

### Output

The function returns an array of objects, one for each rule that was evaluated (and passed or generated an error/warning):

```js
[
  {
    id: 'rule1',
    type: 'ERROR',
    message: 'Description of the rule',
    conditions: [ /* details of the contexts/conditions that passed */ ],
    keyword: 'conditional', // or 'context_limit' if limit reached
    errors: [ /* array of errors/warnings, if any */ ]
  },
  // ... other rules
]
```

- **conditions**:  
  Details of the contexts/conditions that passed for that rule.
- **keyword**:  
  - `'conditional'`: rule evaluated normally.
  - `'context_limit'`: rule not fully evaluated due to context or time limit.
- **errors**:  
  Array of objects with error or warning details (e.g., context limit reached, invalid operator, etc).

---

### Example output with context limit error

```js
[
  {
    id: 'limitTest',
    type: 'ERROR',
    message: 'Test context limit',
    keyword: 'context_limit',
    errors: [
      { cause: 'Context limit reached', context: 'The number of contexts exceeded the limit (10000).' }
    ]
  }
]
```

## Rule Format

Each rule is an object with the following structure:

```js
{
  id: 'unique_rule_id',
  type: 'ERROR' | 'WARNING' | 'INFO' | '...', 
  description: 'Rule description',
  initialDate: '2024-01-01T00:00:00Z', // (optional) rule is active from this date
  endDate: '2024-12-31T23:59:59Z',     // (optional) rule is active until this date
  conditions: [
    {
      ref: 'path.to.value' | '_context.path.to.value',
      operator: '=',
      // One of the following:
      comparisonValue: 'expectedValue', // fixed value
      comparisonRef: 'other.path' | '_context.other.path' // reference to another field
    },
    // ... more conditions
  ]
}
```

- If `comparisonValue` is present, the value will be compared to it.
- If `comparisonRef` is present, the value will be compared to the referenced field (from document or context).
- If both are present, the rule will return an error for that condition.

## Supported Operators

- `=`: equal
- `<>`: not equal
- `<`, `<=`, `>`, `>=`: numeric/string comparison
- `contains`: left includes right
- `does_not_contains`: left does not include right
- `is_contained`: right includes left
- `in`: right (array) includes left
- `not_in`: right (array) does not include left
- `exists`: value exists
- `does_not_exists`: value does not exist
- `is_empty`: value is empty (array/string)
- `is_not_empty`: value is not empty (array/string)

## Array and Context Support

You can use array traversal in conditions, e.g. `items[].price` to apply rules to each item in an array. The engine will evaluate the rule in all relevant contexts.

To reference the context object, use the prefix `_context.` in `ref` or `comparisonRef`.

## Advanced Usage

- **Date-based rules:** Use `initialDate` and/or `endDate` to activate rules only in a specific period.
- **Nested arrays:** The engine supports rules for deeply nested arrays.
- **Comparison between fields:** Use `comparisonRef` to compare two fields (from document or context).

## Error Handling

If a rule or condition is invalid (e.g., both `comparisonValue` and `comparisonRef` are present), the result will include an `errors` field with details.

## License

MIT
