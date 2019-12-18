import update, { CustomCommands, Spec } from 'immutability-helper';


export const getAllKeys = typeof Object.getOwnPropertySymbols === 'function'
  ? (obj: object) => Object.keys(obj).concat(Object.getOwnPropertySymbols(obj) as any)
  : (obj: object) => Object.keys(obj);

export const undoCommands = {
  $push(object: any, field: any, spec: any) {
    return spec.length ? { [field]: { $splice: [[-spec.length, spec.length]] } } : {};
  },
  $unshift(object: any, field: any, spec: any) {
    return spec.length ? { [field]: { $splice: [[0, spec.length]] } } : {};
  },
  $splice(object: any, field: any, spec: any) {
    function createSpliceUndoArgs(array: number[], redoSpliceArgs: number[]) {
      if (!redoSpliceArgs.length) return [];

      const [i, count, ...insert] = redoSpliceArgs;
      const remove = array.slice(i, count);

      return [i, insert.length, ...remove];
    }

    const $splice = [];
    for (let i = spec.length - 1; i >= 0; i--) {
      const stepArray = spec.slice(0, i).reduce((res: number[], spliceArgs: number[]) => {
        const [i, count, ...insert] = spliceArgs;
        res.splice(i, count, ...insert);
        return res;
      }, object[field].slice());

      const stepRedoSpliceArgs = spec[i];
      $splice.push(createSpliceUndoArgs(stepArray, stepRedoSpliceArgs));
    }
    return $splice.length ? { [field]: { $splice } } : {};
  },
  $set(object: any, field: any, spec: any) {
    return object.hasOwnProperty(field) ? { [field]: { $set: object[field] } } : { $unset: [field] };
  },
  $toggle(object: any, field: any, spec: any) {
    return spec.reduce((res: any, key: any) => {
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
  },
  $unset(object: any, field: any, spec: any) {
    return spec.reduce((res: any, key: any) => {
      if (object.hasOwnProperty(key)) {
        res[key] = { $set: object[key] };
      }
      return res;
    }, {});
  },
  $add(object: any, field: any, spec: any) {
    function createAddToSetUndo(set: any, spec: any) {
      return spec.reduce((res: any, item: any) => {
        if (!set.has(item)) {
          if (!res.$remove) {
            res.$remove = [];
          }
          res.$remove.push(item);
        }
        return res;
      }, {});
    }

    function createAddToMapUndo(map: any, spec: any) {
      return spec.reduce((res: any, item: any) => {
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

    const undoObject = object[field] instanceof Set ? createAddToSetUndo(object[field], spec) : createAddToMapUndo(object[field], spec);
    return Object.keys(undoObject).length ? { [field]: { ...undoObject } } : {};
  },
  $remove(object: any, field: any, spec: any) {
    const target = object[field];
    const result = spec.reduce((res: any, keyOrValue: any) => {
      if (target.has(keyOrValue)) {
        if (!res.$add) {
          res.$add = [];
        }
        res.$add.push(target instanceof Set ? keyOrValue : [keyOrValue, target.get(keyOrValue)]);
      }
      return res;
    }, {});

    return result.$add ? { [field]: result } : {};
  },
  $merge(object: any, field: any, spec: any) {
    const target = object[field];
    const result = getAllKeys(spec).reduce((res: any, key: any) => {
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

    return getAllKeys(result).length ? { [field]: { ...result } } : {};
  },
  $apply(object: any, field: any, spec: any) {
    return { [field]: { $set: object[field] } };
  },
};


export function createUndoCommand<T, C extends CustomCommands<object> = never>(object: T, $spec: Spec<T, C>): Spec<T, C> {
  // @ts-ignore
  const ignored = update(object, $spec);

  return {} as Spec<T, C>;
}
