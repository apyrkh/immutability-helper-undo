const deepEql = require('deep-eql');
const update = require('immutability-helper');


// $push
function create$PushUndo(object, field, redoObject) {
  const splice = [-redoObject.length, redoObject.length];
  return { [field]: { $splice: [splice] } };
}

// $unshift
function create$UnshiftUndo(object, field, redoObject) {
  const splice = [0, redoObject.length];
  return { [field]: { $splice: [splice] } };
}

// $splice
function createSpliceUndoArgs(array, redoSpliceArgs) {
  if (!redoSpliceArgs.length) return [];

  const [i, count, ...insert] = redoSpliceArgs;
  const remove = array.slice(i, count);

  return [i, insert.length, ...remove];
}

function create$SpliceUndo(object, field, redoObject) {
  const $splice = [];

  for (let i = redoObject.length - 1; i >= 0; i--) {
    const stepArray = update(object[field], { $splice: redoObject.slice(0, i) });
    const stepRedoSpliceArgs = redoObject[i];

    $splice.push(createSpliceUndoArgs(stepArray, stepRedoSpliceArgs));
  }

  return $splice.length ? { [field]: { $splice } } : {};
}


// $set
function create$SetUndo(object, field, redoObject) {
  return object.hasOwnProperty(field) ? { [field]: { $set: object[field] } } : { $unset: [field] };
}


// $toggle
function create$ToggleUndo(object, field, redoObject) {
  const result = redoObject.reduce((res, key) => {
    if (object.hasOwnProperty(key)) {
      res.$toggle.push(key);
    } else {
      res.$unset.push(key);
    }

    return res;
  }, { $toggle: [], $unset: [] });

  if (!result.$toggle.length) delete result.$toggle;
  if (!result.$unset.length) delete result.$unset;

  return result;
}


// $unset
function create$UnsetUndo(object, field, redoObject) {
  return redoObject.reduce((res, key) => {
    if (object.hasOwnProperty(key)) {
      res[key] = { $set: object[key] };
    }
    return res;
  }, {});
}


// $merge
function create$MergeUndo(object, field, redoObject) {
  const fieldValue = object[field];
  const result = Object.keys(redoObject).reduce((res, key) => {
    if (fieldValue.hasOwnProperty(key)) {
      res[key] = { $set: fieldValue[key] };
    } else {
      res.$unset.push(key);
    }

    return res;
  }, { $unset: [] });

  if (!result.$unset.length) delete result.$unset;

  return { [field]: { ...result } };
}


// $apply
function create$ApplyUndo(object, field, redoObject) {
  return { [field]: { $set: object[field] } };
}


// $add
function createAddToSetUndo(set, redoObject) {
  const result = redoObject.reduce((res, item) => {
    if (!set.has(item)) {
      res.$remove.push(item);
    }

    return res;
  }, { $remove: [] });

  return result.$remove.length ? result : null;
}

function createAddToMapUndo(map, redoObject) {
  const result = redoObject.reduce((res, [key, value]) => {
    if (map.has(key)) {
      res.$add.push([key, map.get(key)]);
    } else {
      res.$remove.push(key);
    }

    return res;
  }, { $add: [], $remove: [] });

  if (!result.$add.length) delete result.$add;
  if (!result.$remove.length) delete result.$remove;

  return result.$add || result.$remove ? result : null;
}

function create$AddUndo(object, field, redoObject) {
  const undoObject = object[field] instanceof Set ? createAddToSetUndo(object[field], redoObject) : createAddToMapUndo(object[field], redoObject);
  return undoObject ? { [field]: { ...undoObject } } : {};
}


// $remove
function create$RemoveUndo(object, field, redoObject) {
  const setOrMap = object[field];
  const result = redoObject.reduce((res, keyOrValue) => {
    if (setOrMap.has(keyOrValue)) {
      res.$add.push(setOrMap instanceof Set ? keyOrValue : [keyOrValue, setOrMap.get(keyOrValue)]);
    }
    return res;
  }, { $add: [] });

  return result.$add.length ? { [field]: result } : {};
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
  create$RemoveUndo(initialState, 'remove1', redoObject.remove1.$remove), create$RemoveUndo(initialState, 'remove2', redoObject.remove2.$remove),
  create$AddUndo(initialState, 'add1', redoObject.add1.$add), create$AddUndo(initialState, 'add2', redoObject.add2.$add),
  create$ApplyUndo(initialState, 'apply', redoObject.apply.$apply),
  create$MergeUndo(initialState, 'merge', redoObject.merge.$merge),
  create$UnsetUndo(initialState, undefined, redoObject.$unset),
  create$ToggleUndo(initialState, undefined, redoObject.$toggle),
  create$SetUndo(initialState, 'set2', redoObject.set2.$set), create$SetUndo(initialState, 'set', redoObject.set.$set),
  create$SpliceUndo(initialState, 'splice', redoObject.splice.$splice),
  create$UnshiftUndo(initialState, 'unshift', redoObject.unshift.$unshift),
  create$PushUndo(initialState, 'push', redoObject.push.$push),
];

const undoObject = smartMergeObjects(undoObjects);
console.log(undoObject);

const restoredState = update(nextState, undoObject);
console.log(restoredState);


console.log(deepEql(initialState, restoredState));
