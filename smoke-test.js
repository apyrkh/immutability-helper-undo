const deepEql = require('deep-eql');
const update = require('immutability-helper');
const { undoCommands } = require('./index');


// $push
function create$PushUndo(object, field, spec) {
  const splice = [-spec.length, spec.length];
  return { [field]: { $splice: [splice] } };
}

// $unshift
function create$UnshiftUndo(object, field, spec) {
  const splice = [0, spec.length];
  return { [field]: { $splice: [splice] } };
}

// $splice
function createSpliceUndoArgs(array, redoSpliceArgs) {
  if (!redoSpliceArgs.length) return [];

  const [i, count, ...insert] = redoSpliceArgs;
  const remove = array.slice(i, count);

  return [i, insert.length, ...remove];
}

function create$SpliceUndo(object, field, spec) {
  const $splice = [];

  for (let i = spec.length - 1; i >= 0; i--) {
    const stepArray = spec.slice(0, i).reduce((res, spliceArgs) => {
      res.splice(...spliceArgs);
      return res;
    }, object[field].slice());

    const stepRedoSpliceArgs = spec[i];

    $splice.push(createSpliceUndoArgs(stepArray, stepRedoSpliceArgs));
  }

  return $splice.length ? { [field]: { $splice } } : {};
}


// $set
function create$SetUndo(object, field, spec) {
  return object.hasOwnProperty(field) ? { [field]: { $set: object[field] } } : { $unset: [field] };
}


// $toggle
function create$ToggleUndo(object, field, spec) {
  return spec.reduce((res, key) => {
    if (object.hasOwnProperty(key)) {
      if (!res.$toggle) {
        res.$toggle = [];
      }
      res.$toggle.push(key);
    } else {
      if (!res.$unset) {
        res.$unset = [];
      }
      res.$unset.push(key);
    }

    return res;
  }, {});
}


// $unset
function create$UnsetUndo(object, field, spec) {
  return spec.reduce((res, key) => {
    if (object.hasOwnProperty(key)) {
      res[key] = { $set: object[key] };
    }
    return res;
  }, {});
}


// $mergef
function create$MergeUndo(object, field, spec) {
  const target = object[field];
  const result = Object.keys(spec).reduce((res, key) => {
    if (target.hasOwnProperty(key)) {
      res[key] = { $set: target[key] };
    } else {
      if (!res.$unset) {
        res.$unset = [];
      }
      res.$unset.push(key);
    }

    return res;
  }, {});

  return Object.keys(result) ? { [field]: { ...result } } : {};
}


// $apply
function create$ApplyUndo(object, field, spec) {
  return { [field]: { $set: object[field] } };
}


// $add
function createAddToSetUndo(set, spec) {
  return spec.reduce((res, item) => {
    if (!set.has(item)) {
      if (!res.$remove) {
        res.$remove = [];
      }
      res.$remove.push(item);
    }
    return res;
  }, {});
}

function createAddToMapUndo(map, spec) {
  return spec.reduce((res, item) => {
    const [key, value] = item;
    if (map.has(key)) {
      if (!res.$add) {
        res.$add = [];
      }
      res.$add.push([key, map.get(key)]);
    } else {
      if (!res.$remove) {
        res.$remove = [];
      }
      res.$remove.push(key);
    }

    return res;
  }, {});
}

function create$AddUndo(object, field, spec) {
  const undoObject = object[field] instanceof Set ? createAddToSetUndo(object[field], spec) : createAddToMapUndo(object[field], spec);
  return Object.keys(undoObject).length ? { [field]: { ...undoObject } } : {};
}


// $remove
function create$RemoveUndo(object, field, spec) {
  const target = object[field];
  const result = spec.reduce((res, keyOrValue) => {
    if (target.has(keyOrValue)) {
      if (!res.$add) {
        res.$add = [];
      }
      res.$add.push(target instanceof Set ? keyOrValue : [keyOrValue, target.get(keyOrValue)]);
    }
    return res;
  }, {});

  return result.$add ? { [field]: result } : {};
}


// =================
// === execution ===
// =================

const initialState = {
  push: [1, 2, 3, 4],
  unshift: [1, 2, 3, 4],
  splice: [1, 2, 3, 4],
  set: 'a',
  toggle1: true, toggle2: false,
  unset1: 'a', unset2: 'b',
  merge: { a: 5, b: 3 },
  apply: 5,
  add1: new Set([1, 2, 3, 4]), add2: new Map([[1, 'one'], [2, 'two']]),
  remove1: new Set([1, 2, 3, 4]), remove2: new Map([[1, 'one'], [2, 'two']]),
};
// console.log(initialState);


const redoObject = {
  push: { $push: [5, 6] },
  unshift: { $unshift: [5, 6] },
  splice: { $splice: [[0, 1, 12, 13, 14], [0, 1], [0, 2], []] },
  set: { $set: 'b' }, set2: { $set: 'c' },
  $toggle: ['toggle1', 'toggle2', 'toggle3'],
  $unset: ['unset1', 'unset2', 'unset3'],
  merge: { $merge: { b: 6, c: 7 } },
  apply: { $apply: (x) => x * 2 },
  add1: { $add: [4, 5, 6] }, add2: { $add: [[2, 'twooo'], [3, 'three']] },
  remove1: { $remove: [4, 5, 6] }, remove2: { $remove: [2, 3] }
};
const nextState = update(initialState, redoObject);

// console.log(nextState);


function smartMergeObjects(objects) {
  return objects.reduce((res, object) => {
    Object.keys(object).forEach((key) => {
      const isArray = Array.isArray(object[key]);
      if (!res[key]) {
        res[key] = isArray ? [] : {};
      }

      if (isArray) {
        res[key].push(...object[key]);
      } else {
        if (!res[key].hasOwnProperty('$set')) {
          if (object[key].hasOwnProperty('$set')) {
            res[key] = object[key];
          } else {
            Object.assign(res[key], object[key]);
          }
        }
      }
    });

    return res;
  }, {});
}

const undoObjects = [
  undoCommands['$remove'](initialState, 'remove1', redoObject.remove1.$remove),
  undoCommands['$remove'](initialState, 'remove2', redoObject.remove2.$remove),
  undoCommands['$add'](initialState, 'add1', redoObject.add1.$add),
  undoCommands['$add'](initialState, 'add2', redoObject.add2.$add),
  undoCommands['$apply'](initialState, 'apply', redoObject.apply.$apply),
  undoCommands['$merge'](initialState, 'merge', redoObject.merge.$merge),
  undoCommands['$unset'](initialState, undefined, redoObject.$unset),
  undoCommands['$toggle'](initialState, undefined, redoObject.$toggle),
  undoCommands['$set'](initialState, 'set2', redoObject.set2.$set),
  undoCommands['$set'](initialState, 'set', redoObject.set.$set),
  undoCommands['$splice'](initialState, 'splice', redoObject.splice.$splice),
  undoCommands['$unshift'](initialState, 'unshift', redoObject.unshift.$unshift),
  undoCommands['$push'](initialState, 'push', redoObject.push.$push),
];

const undoObject = smartMergeObjects(undoObjects);
console.log(undoObject);

const restoredState = update(nextState, undoObject);
console.log(restoredState);


console.log(deepEql(initialState, restoredState));
