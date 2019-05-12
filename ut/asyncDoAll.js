
const asyncDoAll = (arr, callback, finished) => {
  let counter = 0;
  const done = () => {
    if (++counter === arr.length) finished();
  };
  arr.forEach((el, index) => {
    callback(el, index, done);
  });
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
asyncDoAll(oldArray, (el, index, done) => {
  someCallbackFunc(el, () => {
    done();
  });
}, () => {
  // then do stuff afer complete
  console.log('result', oldArray[0] === newArray[2] && oldArray[1] === newArray[1] && oldArray[2] === newArray[0]);
  console.log(newArray);
});
