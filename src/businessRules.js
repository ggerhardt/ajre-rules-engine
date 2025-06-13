/* eslint-disable max-len */
import objectPath from 'object-path';

/**
 * Validates a set of rules against a JSON document.
 * Now supports arrays referenced in both 'ref' and 'comparisonRef',
 * generating contexts for all possible combinations (cartesian product)
 * when necessary.
 *
 * Example with arrays in both fields:
 *   ref: 'clients[].age', comparisonRef: 'references[].minAge'
 *   => All combinations of clients and references will be evaluated.
 *
 * Example with only one array field:
 *   ref: 'clients[].age', comparisonRef: 'minAge'
 *   => Each client will be evaluated against the fixed minAge value.
 *
 * @param {object} documentJson The JSON document to validate.
 * @param {Array<object>} rules The array of rules to validate.
 * @param {object|null} contextObj Optional context object. If provided, rules can reference it using '_context.' in their paths.
 * @param {object} options Optional settings: { contextLimit: number (default 10000), timeLimit: number (seconds, default 200), returnAllContexts: boolean (default true) }
 * @return {Array<object>} An array of objects containing the IDs and types of the rules that passed, along with their contexts.
 */
export function validateRules(documentJson, rules, contextObj = null, options = {}) {
  const rulesObj = JSON.parse(JSON.stringify(rules));
  const contextLimit = options.contextLimit !== undefined ? options.contextLimit : 10000;
  const timeLimit = options.timeLimit !== undefined ? options.timeLimit : 200; // seconds
  const returnAllContexts = options.returnAllContexts !== undefined ? options.returnAllContexts : true;
  const results = [];
  const validRulesByDate = filterRulesByDate(rulesObj);
  const startTime = Date.now();

  validRulesByDate.forEach((rule) => {
    try {
      const loops = [];
      rule.conditionResultContext = [];

      processConditionsForLoops(rule, loops);

      const sortedLoops = sortLoopsByPath(loops);
      if (!validateArrayReferences(sortedLoops, rule)) return;

      // CONTADOR DE CONTEXTOS E FLAGS DE LIMITE
      const contextCounter = { count: 0, limitReached: false, timeReached: false };
      rule.contexts = explodeContexts(documentJson, rule.conditions, loops, [], contextLimit, startTime, timeLimit, contextCounter);
      rule.contextLimitReached = contextCounter.limitReached;
      rule.timeLimitReached = contextCounter.timeReached;

      if (rule.contexts.length === 0) {
        rule.conditionsResult = evaluateSimpleConditions(documentJson, rule.conditions, contextObj);
      } else {
        rule.conditionResultContext = evaluateConditionsInContexts(documentJson, rule, loops, contextObj, returnAllContexts);
      }

      addRuleToResults(rule, results);
      // Adiciona aviso se limite atingido
      if (rule.contextLimitReached || rule.timeLimitReached) {
        results.push({
          id: rule.id,
          type: rule.type,
          message: rule.description,
          keyword: 'context_limit',
          errors: [
            rule.contextLimitReached ? { cause: 'Context limit reached', context: `The number of contexts exceeded the limit (${contextLimit}).` } : null,
            rule.timeLimitReached ? { cause: 'Time limit reached', context: `The time limit of ${timeLimit} seconds was exceeded during context generation.` } : null,
          ].filter(Boolean),
        });
      }
    } catch (error) {
      logError(`Error processing rule [${rule.id}]`, error);
      results.push({
        id: rule.id,
        type: rule.type,
        message: rule.description,
        conditions: rule.conditionsResult?.items || [],
        keyword: 'conditional',
        errors: [
          {
            cause: error.message,
            context: `Error occurred while processing rule [${rule.id}]`,
          },
        ],
      });
    }
  });

  return results;
}

/**
 * Filters rules based on their validity dates.
 * @param {Array<object>} rules The array of rules.
 * @return {Array<object>} The filtered rules.
 */
function filterRulesByDate(rules) {
  return rules.filter((rule) => {
    const isAfterStartDate = rule.initialDate ? new Date(rule.initialDate) <= new Date() : true;
    const isBeforeEndDate = rule.endDate ? new Date(rule.endDate) >= new Date() : true;
    return isAfterStartDate && isBeforeEndDate;
  });
}

/**
 * Identifies and expands loops (arrays) in a rule's conditions.
 * Now analyzes both the 'ref' and 'comparisonRef' fields,
 * ensuring all referenced arrays are considered in context generation.
 *
 * Example: If 'ref' references 'clients[]' and 'comparisonRef' references 'references[]',
 * both will be considered and the cartesian product of indices will be generated.
 *
 * @param {object} rule The rule being processed.
 * @param {Array<object>} loops The array where identified loops will be stored.
 */
function processConditionsForLoops(rule, loops) {
  rule.conditions.forEach((condition, conditionIndex) => {
    // Lista de campos a analisar: ref e comparisonRef
    ['ref', 'comparisonRef'].forEach((field) => {
      if (condition[field]) {
        let refValue = condition[field];
        while (refValue.includes('[]')) {
          const {objectName, completeObjectPath} = extractLoopDetails(refValue);
          // Evita duplicidade de loops
          if (!loops.some(loop => loop.completeObjectPath === completeObjectPath)) {
            loops.push({objectName, completeObjectPath, parm: `@${loops.length}`});
          }
          // Atualiza todos os campos ref e comparisonRef das condições
          rule.conditions.forEach((innerCondition) => {
            ['ref', 'comparisonRef'].forEach((innerField) => {
              if (innerCondition[innerField] && innerCondition[innerField].includes(`${objectName}[]`)) {
                innerCondition[innerField] = innerCondition[innerField].replaceAll(
                  `${objectName}[]`,
                  `${objectName}[@${loops.length - 1}]`,
                );
              }
            });
          });
          // Atualiza o valor para continuar o while, se houver mais de um []
          refValue = refValue.replace(`${objectName}[]`, `${objectName}[@${loops.length - 1}]`);
        }
      }
    });
  });
}

/**
 * Extracts details of a loop from a condition value.
 * @param {string} value The condition value.
 * @return {object} The extracted loop details.
 */
function extractLoopDetails(value) {
  const completeObjectPath = value.split('[]')[0];
  const lastDotIndex = completeObjectPath.lastIndexOf('.');
  const objectName = completeObjectPath.slice(lastDotIndex + 1);
  return {objectName, completeObjectPath};
}

/**
 * Sorts loops by their complete object paths.
 * @param {Array<object>} loops The array of loops.
 * @return {Array<object>} The sorted loops.
 */
function sortLoopsByPath(loops) {
  return loops.sort((a, b) => a.completeObjectPath.localeCompare(b.completeObjectPath));
}

/**
 * Validates array references in loops.
 * Now allows any combination of arrays (cartesian product),
 * only issuing a warning if there are arrays with the same name but different paths.
 * Never blocks the rule.
 *
 * @param {Array<object>} sortedLoops The sorted loops.
 * @param {object} rule The rule being validated.
 * @return {boolean} Always returns true.
 */
function validateArrayReferences(sortedLoops, rule) {
  // Permitir qualquer combinação de arrays (produto cartesiano)
  // Apenas emitir aviso se houver caminhos de array com o mesmo nome mas caminhos diferentes
  const paths = sortedLoops.map(l => l.completeObjectPath);
  const names = sortedLoops.map(l => l.objectName);
  const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
  if (duplicates.length > 0) {
    console.warn(
      `Warning: Rule [${rule.id}] references multiple arrays with the same name (${duplicates.join(', ')}), but different paths: ${paths.join(', ')}`
    );
  }
  return true;
}

/**
 * Generates all possible contexts of a JSON document based on conditions and loops.
 * Now always returns an array of contexts, even when there are no loops (returns [ [] ]).
 * This ensures rules with only one array field or different arrays are evaluated correctly.
 *
 * Example:
 *   loops: [clients[], references[]] => contexts: [ [0,0], [0,1], [1,0], [1,1] ]
 *
 * @param {object} documentJson The JSON document to explode.
 * @param {Array<object>} conditions The conditions to apply.
 * @param {Array<object>} existingLoops The identified loops.
 * @param {Array<number>} currentTuple The current tuple of indices (for recursion).
 * @param {number} contextLimit The maximum number of contexts allowed.
 * @param {number} startTime The start time of the operation.
 * @param {number} timeLimit The maximum time allowed for the operation.
 * @param {object} contextCounter An object to track context count and limits.
 * @return {Array<Array<number>>} Array of contexts (each context is an array of indices).
 */
function explodeContexts(documentJson, conditions, existingLoops, currentTuple, contextLimit = 10000, startTime = Date.now(), timeLimit = 200, contextCounter = { count: 0, limitReached: false, timeReached: false }) {
  const loops = [...existingLoops];
  const totalTuples = [];
  if (loops.length === 0) {
    contextCounter.count++;
    if (contextCounter.count > contextLimit) {
      contextCounter.limitReached = true;
      return [];
    }
    if ((Date.now() - startTime) / 1000 > timeLimit) {
      contextCounter.timeReached = true;
      return [];
    }
    return [currentTuple];
  }
  const currentLoop = JSON.parse(JSON.stringify(loops.shift()));
  const loopItemsCount = objectPath.get(documentJson, currentLoop.completeObjectPath) ?? [];
  for (let i = 0; i < loopItemsCount.length; i++) {
    if (contextCounter.limitReached || contextCounter.timeReached) break;
    if (loops.length > 0) {
      const newLoops = loops.map((item) => {
        return {
          objectName: item.objectName,
          completeObjectPath: item.completeObjectPath.replace(
              `${currentLoop.completeObjectPath}[${currentLoop.parm}]`,
              `${currentLoop.completeObjectPath}.${i}`,
          ),
        };
      });
      explodeContexts(documentJson, conditions, [...newLoops], [...currentTuple, i], contextLimit, startTime, timeLimit, contextCounter).forEach((tuple) => {
        if (!contextCounter.limitReached && !contextCounter.timeReached) {
          totalTuples.push(tuple);
        }
      });
    } else {
      contextCounter.count++;
      if (contextCounter.count > contextLimit) {
        contextCounter.limitReached = true;
        break;
      }
      if ((Date.now() - startTime) / 1000 > timeLimit) {
        contextCounter.timeReached = true;
        break;
      }
      totalTuples.push([...currentTuple, i]);
    }
  }
  return totalTuples;
}

/**
 * Evaluates simple conditions without contexts.
 * @param {object} documentJson The JSON document.
 * @param {Array<object>} conditions The conditions to evaluate.
 * @param {object|null} contextObj Optional context object. If provided, rules can reference it using '_context.' in their ref or comparisonRef paths.
 * @return {object} The result of the evaluation.
 */
function evaluateSimpleConditions(documentJson, conditions, contextObj = null) {
  return conditions.reduce(
      (result, condition) => {
        if (result.response) {
          try {
            // Suporte a comparisonRef
            if (condition.comparisonValue !== undefined && condition.comparisonRef !== undefined) {
              throw new Error('A condition cannot have both comparisonValue and comparisonRef.');
            }
            const leftValue = getValueWithContext(documentJson, condition.ref, contextObj);
            let rightValue;
            if (condition.comparisonRef !== undefined) {
              rightValue = getValueWithContext(documentJson, condition.comparisonRef, contextObj);
            } else {
              rightValue = condition.comparisonValue;
            }
            const test = testCondition(leftValue, rightValue, condition.operator);
            if (test) {
              result.items.push({
                instancePath: condition.ref,
                instancePathValue: leftValue,
                operator: condition.operator,
                comparisonValue: rightValue,
              });
            }
            return {response: test, items: result.items};
          } catch (error) {
            logError('Error in evaluateSimpleConditions', error);
            throw new Error(`Failed to evaluate conditions in one context.`);
          }
        }
        return {response: false, items: result.items};
      },
      {response: true, items: []},
  );
}

/**
 * Evaluates conditions in multiple contexts.
 * @param {object} documentJson The JSON document.
 * @param {object} rule The rule being evaluated.
 * @param {Array<object>} loops The loops to consider.
 * @param {object|null} contextObj Optional context object. If provided, rules can reference it using '_context.' in their ref or comparisonRef paths.
 * @param {boolean} returnAllContexts Whether to return all contexts or stop at the first valid one.
 * @return {Array<object>} The results of the evaluation for each context.
 */
function evaluateConditionsInContexts(documentJson, rule, loops, contextObj = null, returnAllContexts = true) {
  const results = [];
  for (const context of rule.contexts) {
    const conditionsInContext = rule.conditions.map((condition) =>
      replaceContextValues(condition, loops, context),
    );

    const evaluation = conditionsInContext.reduce(
      (prevItem, condition) => {
        if (prevItem.result) {
          try {
            if (condition.comparisonValue !== undefined && condition.comparisonRef !== undefined) {
              throw new Error('A condition cannot have both comparisonValue and comparisonRef.');
            }
            const leftValue = getValueWithContext(documentJson, condition.ref, contextObj);
            let rightValue;
            if (condition.comparisonRef !== undefined) {
              rightValue = getValueWithContext(documentJson, condition.comparisonRef, contextObj);
            } else {
              rightValue = condition.comparisonValue;
            }
            const test = testCondition(leftValue, rightValue, condition.operator);
            if (test) {
              prevItem.conditionValues.push({
                instancePath: condition.ref,
                instancePathValue: leftValue,
                operator: condition.operator,
                comparisonValue: rightValue,
              });
              return {result: true, conditionValues: prevItem.conditionValues};
            }
            return {result: false, conditionValues: prevItem.conditionValues};
          } catch (error) {
            logError('Error in evaluateConditionsInContexts', error);
            throw new Error(`Failed to evaluate conditions in one context in rule [${rule.id}].`);
          }
        }
        return {result: false, conditionValues: prevItem.conditionValues};
      },
      {result: true, conditionValues: []},
    );

    if (evaluation.result) {
      results.push(evaluation);
      if (!returnAllContexts) {
        return results;
      }
    }
  }
  return results;
}

/**
 * Tests a condition against two values.
 * @param {any} leftValue The left-hand side value of the condition.
 * @param {any} rightValue The right-hand side value of the condition.
 * @param {string} operator The operator to use for the comparison.
 * @return {boolean} True if the condition is met, false otherwise.
 */
function testCondition(leftValue, rightValue, operator) {
  try {
    if (operator === 'exists') return typeof leftValue !== 'undefined';
    if (operator === 'does_not_exists') return typeof leftValue === 'undefined';
    if (typeof leftValue === 'undefined') return false; // Avoids error when leftValue is undefined
    if (operator === 'is_empty') return leftValue.length === 0;
    if (operator === 'is_not_empty') return leftValue.length > 0;

    if (typeof leftValue === 'string') leftValue = leftValue.toLowerCase();
    if (typeof rightValue === 'string') rightValue = rightValue.toLowerCase();

    if (operator === '=') return leftValue === rightValue;
    if (operator === '<>') return leftValue !== rightValue;
    if (operator === '<') return leftValue < rightValue;
    if (operator === '<=') return leftValue <= rightValue;
    if (operator === '>') return leftValue > rightValue;
    if (operator === '>=') return leftValue >= rightValue;
    if (operator === 'contains') return leftValue.includes(rightValue);
    if (operator === 'does_not_contains') return !leftValue.includes(rightValue);
    if (operator === 'is_contained') return rightValue.includes(leftValue);
    if (operator === 'in') return rightValue.includes(leftValue);
    if (operator === 'not_in') return !rightValue.includes(leftValue);

    throw new Error(`Unsupported operator: ${operator}`);
  } catch (error) {
    logError(`Error in testCondition with operator [${operator}]`, error);
    throw new Error(`Failed to test condition with operator [${operator}].`);
  }
}

/**
 * Replaces context indices in both 'ref' and 'comparisonRef'.
 * This ensures that, for each context, the paths are correct for lookup in the JSON.
 *
 * Example:
 *   ref: 'clients[@0].age', comparisonRef: 'references[@1].minAge', context: [1,0]
 *   => ref: 'clients.1.age', comparisonRef: 'references.0.minAge'
 *
 * @param {object} condition The condition to be adjusted.
 * @param {Array<object>} loops The considered loops.
 * @param {Array<number>} context The context of indices.
 * @return {object} The condition with adjusted paths.
 */
function replaceContextValues(condition, loops, context) {
  let adjustedRef = condition.ref;
  let adjustedComparisonRef = condition.comparisonRef;
  loops.forEach((loop, loopIndex) => {
    adjustedRef = adjustedRef?.replaceAll(`[@${loopIndex}]`, `.${context[loopIndex]}`);
    if (adjustedComparisonRef) {
      adjustedComparisonRef = adjustedComparisonRef.replaceAll(`[@${loopIndex}]`, `.${context[loopIndex]}`);
    }
  });
  return {
    ref: adjustedRef,
    operator: condition.operator,
    comparisonValue: condition.comparisonValue,
    comparisonRef: adjustedComparisonRef,
  };
}

/**
 * Adds a rule to the results if its conditions are met.
 * If an error occurs, it should be handled gracefully.
 * @param {object} rule The rule being processed.
 * @param {Array<object>} results The results array.
 */
function addRuleToResults(rule, results) {
  try {
    if (rule.conditionResultContext && rule.conditionResultContext.length > 0) {
      results.push({
        id: rule.id,
        type: rule.type,
        message: rule.description,
        conditions: rule.conditionResultContext,
        keyword: 'conditional',
      });
    } else if (rule.conditionsResult && rule.conditionsResult.response && rule.conditionsResult.items && rule.conditionsResult.items.length > 0) {
      results.push({
        id: rule.id,
        type: rule.type,
        message: rule.description,
        conditions: {result: true, conditionValues: rule.conditionsResult.items},
        keyword: 'conditional',
      });
    }
  } catch (error) {
    logError(`Error adding rule [${rule.id}] to results`, error);
    results.push({
      id: rule.id,
      type: rule.type,
      message: rule.description,
      conditions: [],
      keyword: 'conditional',
      errors: [
        {
          cause: error.message,
          context: `Error occurred while adding rule [${rule.id}] to results`,
        },
      ],
    });
  }
}

/**
 * Logs an error with a detailed message.
 * @param {string} message The error message.
 * @param {Error} error The error object.
 */
function logError(message, error) {
  console.error(`[ERROR] ${message}:`, {
    message: error.message,
    stack: error.stack,
  });
}

// Nova função utilitária para buscar valores considerando contextObj e _context prefix
function getValueWithContext(documentJson, path, contextObj) {
  if (typeof path === 'string' && path.startsWith('_context.') && contextObj) {
    return objectPath.get(contextObj, path.replace('_context.', ''));
  }
  return objectPath.get(documentJson, path);
}
