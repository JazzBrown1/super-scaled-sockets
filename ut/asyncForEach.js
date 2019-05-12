const asyncForEach = (arr, callback, finished) => {
  let index = 0;
  const next = () => {
    if (index < arr.length) callback(arr[index], index++, next);
    else finished();
  };
  next();
};

// unit test
const newArray = [];
const oldArray = [1, 2, 3];
const someCallbackFunc = (el, callback) => {
  setTimeout(() => {
    newArray.push(el);
    callback();
  }, 2000 - el * 100);
};
asyncForEach(oldArray, (el, index, next) => {
  someCallbackFunc(el, () => {
    next();
  });
}, () => {
  // then do stuff afer complete
  console.log('result', oldArray[0] === newArray[0] && oldArray[1] === newArray[1] && oldArray[2] === newArray[2]);
  console.log(newArray);
});
