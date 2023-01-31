const {
    Worker,
    isMainThread,
    parentPort,
    workerData
} = require("worker_threads");

async function h (data) {
  setTimeout(() => { parentPort.postMessage(`You said \"${data}\".`); }, 2000);
  }
if (isMainThread) {
let jata = true

function asyncTaskDone() {
    if(jata != false) {//we want it to match
            console.log(jata)
            setTimeout(() => asyncTaskDone(), 500);//wait 50 millisecnds then recheck
    } else {
      return true;
    }
  }

    const worker = new Worker(__filename, {workerData: "hello"});
    worker.on("message", msg => { jata = false; console.log(`Worker message received: ${jata}`) });
    worker.on("error", err => console.error(error));
    worker.on("exit", code => console.log(`Worker exited with code ${code}.`));
    function check() {
        if (jata == true) {
            console.log("Value Is Set");
    
            // We don't need to interval the check function anymore,
            // clearInterval will stop its periodical execution.
            clearInterval(interval);
        }
    }
    
    // Create an instance of the check function interval
    let interval = setInterval(check, 1000);
}
else {
    const data = workerData;
    h(data);
}