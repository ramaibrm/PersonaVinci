// import { Configuration, OpenAIApi } from 'openai'

const { Configuration, OpenAIApi } = require('openai');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const AIChar = require('./AI_Characteristics.json')
const { exec } = require("child_process");
const { Worker, isMainThread, workerData, parentPort } = require("worker_threads")
const readline = require("readline");

const bloomAIURL = 'https://api-inference.huggingface.co/models/bigscience/bloom'
const hfAPI = 'insert Huggingface API Key'

const configuration = new Configuration({
    apiKey: "insert OpenAI API Key"
  });
  
const openai = new OpenAIApi(configuration);

const configuration2 = new Configuration({
  apiKey: "insert OpenAI API Key"
});

let totalPrompts = 0;

const openai2 = new OpenAIApi(configuration2);

async function openFile(filepath) {
    return new Promise((resolve, reject) => {
      fs.readFile(filepath, 'utf8', (err, data) => {
        if (err) return reject(err);
        return resolve(data);
      });
    });
  }

function saveFile(filepath, content) {
    let outfile = new FileWriter();
    outfile.writeAsText(filepath, content, 'utf-8');
}

function loadJson(filepath) {
    let infile = new FileReader();
    infile.readAsText(filepath, 'utf-8');
    return JSON.parse(infile.result);
}

async function saveJson(filepath, payload) {
    try {
      await fs.promises.writeFile(filepath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      throw error;
    }
  }

function timestampToDatetime(unixTime) {
    return new Date(unixTime).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', timeZoneName: 'short' }); 
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function similarity(v1, v2) {
    return dotProduct(v1, v2) / (vectorNorm(v1) * vectorNorm(v2));
}

function dotProduct(v1, v2) {
    let result = 0;
    for (let i = 0; i < v1.length; i++) {
        result += v1[i] * v2[i];
    }
    return result;
}

function vectorNorm(vector) {
    let sum = 0;
    for (let i = 0; i < vector.length; i++) {
        sum += vector[i] ** 2;
    }
    return Math.sqrt(sum);
}

function fetchMemories(vector, logs, count) {
    let scores = [];
    logs.forEach((i) => {
      if (vector === i.vector) {
        return;
      }
      let score = similarity(i.vector, vector);
      i.score = score;
      scores.push(i);
    });
    let ordered = scores.sort((a, b) => b.score - a.score);
    try {
      ordered = ordered.slice(0, count);
      return ordered;
    } catch (error) {
      return ordered;
    }
  }

async function bloomCompletion(prompt, token = 115, noBreakLines = false) {
  const config = {
    headers: {
      'Authorization': `Bearer ${hfAPI}`,
    }
  };
  const data = {
    "inputs": prompt,
    "parameters": {
      "do_sample": false,
      "max_new_tokens": token,
      "return_full_text": false,
    }
  }
  try {
    const response = await axios.post(bloomAIURL, data, config);
    console.log("Task Completed ...");
    // console.log(response.data[0].generated_text)
    let text = response.data[0].generated_text.trim();
    text = text.replace(/(\r\n)+/g, '\n');
    text = text.replace(/(\t )+/g, ' ');
    let filename = `${Date.now()}_bloom.txt`;
    if (!fs.existsSync('gpt3_logs_js')) {
        fs.mkdirSync('gpt3_logs_js');
    }
    fs.writeFileSync(`gpt3_logs_js/${filename}`, `${prompt}\n${text}`);
    if (noBreakLines) {
      return text.split("\n")[0]
    }
    return text;
  } catch (err) {
    console.log(err)
  }
}

async function gpt3Embedding(content, engine = 'text-embedding-ada-002') {
  content = content.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
  const config = {
    headers: {
      'Authorization': `Bearer ${configuration.apiKey}`,
      'Content-Type': 'application/json',
    }
  };

  const data = {
    "input": content,
    "model": engine
  };

  try {
    const response = await axios.post('https://api.openai.com/v1/embeddings', data, config);
    const vector = response.data.data[0].embedding;
    return vector;
  } catch (error) {
      console.error(error);
      return false;
  }
}

function readPrompt () {
  try {
      const data = fs.readFileSync('prompt.txt', 'utf-8');
      return data
    } catch (err) {
      console.error(err);
      return err
    }
}

async function gpt3AltCompletion(prompt, engine = 'text-davinci-003', temp = 0.0, topP = 1, tokens = 800, freqPen = 0, presPen = 0, stop = ['USER:', 'RAVEN:']) {
  let maxRetry = 5;
  let retry = 0;

  while (true) {
      try {
      const response = await openai2.createCompletion({
          model: engine,
          prompt: prompt,
          temperature: temp, // Higher values means the model will take more risks.
          max_tokens: tokens, // The maximum number of tokens to generate in the completion. Most models have a context length of 2048 tokens (except for the newest models, which support 4096).
          top_p: topP, // alternative to sampling with temperature, called nucleus sampling
          frequency_penalty: freqPen, // Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.
          presence_penalty: presPen, // Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics.
      });
      console.log("Task Completed ...")

      let text = response.data.choices[0].text.trim();
      text = text.replace(/(\r\n)+/g, '\n');
      text = text.replace(/(\t )+/g, ' ');
      let filename = `${Date.now()}_gpt3.txt`;
      if (!fs.existsSync('gpt3_logs_js')) {
          fs.mkdirSync('gpt3_logs_js');
      }
      fs.writeFileSync(`gpt3_logs_js/${filename}`, `${prompt}\n${text}`);
      return text;
      } catch (oops) {
      retry += 1;
      if (retry >= maxRetry) {
          return `GPT3 error: ${oops}`;
      }
      console.log('Error communicating with OpenAI:', oops);
      await sleep(1000);
      }
  }
}

async function gpt3Completion(prompt, engine = 'text-curie-001', temp = 0.0, topP = 1, tokens = 800, freqPen = 0, presPen = 0, stop = ['USER:', 'RAVEN:']) {
    let maxRetry = 5;
    let retry = 0;

    while (true) {
        try {
        const response = await openai.createCompletion({
            model: engine,
            prompt: prompt,
            temperature: temp, // Higher values means the model will take more risks.
            max_tokens: tokens, // The maximum number of tokens to generate in the completion. Most models have a context length of 2048 tokens (except for the newest models, which support 4096).
            top_p: topP, // alternative to sampling with temperature, called nucleus sampling
            frequency_penalty: freqPen, // Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.
            presence_penalty: presPen, // Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics.
            stop: stop,
        });
        console.log("Task Completed ...")

        let text = response.data.choices[0].text.trim();
        text = text.replace(/(\r\n)+/g, '\n');
        text = text.replace(/(\t )+/g, ' ');
        let filename = `${Date.now()}_gpt3.txt`;
        if (!fs.existsSync('gpt3_logs_js')) {
            fs.mkdirSync('gpt3_logs_js');
        }
        fs.writeFileSync(`gpt3_logs_js/${filename}`, `${prompt}\n${text}`);
        totalPrompts += response.data.usage.total_tokens
        return text;
        } catch (oops) {
        retry += 1;
        if (retry >= maxRetry) {
            return `GPT3 error: ${oops}`;
        }
        console.log('Error communicating with OpenAI:', oops.data.error);
        await sleep(1000);
        }
    }
}

// const prompt = readPrompt();
// gpt3Completion(prompt);

  async function loadConvo() {
    const directory = 'memories_logs';
    const files = await fs.promises.readdir(directory);
    const filteredFiles = files.filter((file) => path.extname(file) === '.json');
    const result = [];
    for (const file of filteredFiles) {
        const filePath = path.join(directory, file);
        const data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
        result.push(data);
    }
    result.sort((a, b) => a.time - b.time);
    return result;
}

async function loadPersona() {
  const directory = 'personality_logs';
  const files = await fs.promises.readdir(directory);
  const filteredFiles = files.filter((file) => path.extname(file) === '.json');
  const result = [];
  for (const file of filteredFiles) {
      const filePath = path.join(directory, file);
      const data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      if (data.message != "None") {
        result.push(data);
      }
  }
  result.sort((a, b) => a.time - b.time);
  return result;
}

async function summarizeMemories(memories) {
    memories = memories.sort((a, b) => new Date(a.time) - new Date(b.time));
    let block = '';
    const identifiers = [];
    const timestamps = [];
    memories.forEach((mem) => {
      let memContent = mem.message.replace(/(\r\n|\n|\r)/gm, "");
      block += `${memContent} \n`;
      identifiers.push(mem.uuid);
      timestamps.push(mem.time);
    });
    block = block.trim();
    let prompt = await openFile('prompt_notes.txt')
    prompt = prompt.replace('<<INPUT>>', block)
    const info = {
      notes: block,
      uuids: identifiers,
      times: timestamps,
      uuid: uuidv4(),
    };
    const filename = `notes_${Date.now()}.json`;
    await saveJson(`notes/${filename}`, info);
    // return notes;
    parentPort.postMessage(block);
  }

  const getLastMessages = (conversation, limit) => {
    let short;
    try {
      short = conversation.slice(-limit);
    } catch {
      short = conversation;
    }
    let output = '';
    short.forEach((c) => {
      output += `${c.rawMessage}\n\n`;
    });
    return output.trim();
  };

async function assignPersona(message, timestamp, vector, timestring) {
    let personaPrompt = await openFile('prompt_interest.txt')
    personaPrompt = personaPrompt.replace('<<TEXT>>', message)

    const persona = await gpt3Completion(personaPrompt, 'text-davinci-003', 1.0, 1, 758);

    const newUUID = uuidv4();
    const info = {'speaker': AIChar.characterName, 'time': timestamp, 'vector': vector, 'message': persona, 'uuid': newUUID, 'timestring': timestring}
    const filename = "persona_" + timestamp + `_${AIChar.characterName}.json`;
    if (persona != "None") {
      await saveJson(`personality_logs/${filename}`, info);
    }
}

function synthesizeMood(mood) {
  switch (mood) {
    case "EXCITED":
      return "cheerful"
    case "SNARKY":
      return "unfriendly"
    case "ANGRY":
      return "angry"
    case "PLAYFUL":
      return "friendly"
    case "HAPPY":
      return "friendly"
    default:
      return "friendly"
  }
}


let mood = 'Snarky';
let viewerName = 'Az';

async function main () {
  if (isMainThread) {
    function asyncTaskDone() {
      if(typeof notes != 'string') {//we want it to match
        console.log(typeof notes, 'typeof')
          setTimeout(() => asyncTaskDone(), 500);//wait 50 millisecnds then recheck
      } else {
        return true;
      }
    }
    let notes = {};
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question("Enter CHAT: >> ", async function (text) {
      rl.close();
      const a = `"${text}"`
      let timestamp = Date.now();
      let vector = await gpt3Embedding(a);
  
      // load conversation
      console.log("Opening Brain ...")
      const conversation = await loadConvo();
      const traits = await loadPersona();
      let timestring = timestampToDatetime(timestamp)
  
      let message = `${a} - Said by ${viewerName} at ${timestring}`;
      let rawMessage = `${viewerName}: ${a}`
      let newUUID = uuidv4();
      let info = {'speaker': viewerName, 'time': timestamp, 'vector': vector, 'message': message, 'rawMessage': rawMessage, 'uuid': newUUID, 'timestring': timestring}
      let filename = "log_" + timestamp + `_${viewerName}.json`;
      await saveJson(`memories_logs/${filename}`, info);
  
      // compose corpus (fetch memories, etc)
      const memories = fetchMemories(vector, conversation, 3) // pull episodic memories
      const personalities = fetchMemories(vector, traits, 2);
      let personalitiesBlock = '';
      personalities.forEach((per) => {
        personalitiesBlock += `${per.message} \n`;
      });
  
      // Fetch declarative memories (facts, questions, events)
      console.log("Fetching Episodic Memories ...")
      const worker = new Worker(__filename, {workerData: memories});
      worker.on("message", msg => { notes = msg });
      worker.on("error", err => console.error(err));

  
      // Get recent conversations
      const recent = getLastMessages(conversation, 3)
      let prompt = await openFile('prompt_response.txt')
  
      let topicPrompt = await openFile('search_topic.txt')
      topicPrompt = topicPrompt.replace("<<PREVIOUS_CHAT>>", getLastMessages(conversation, 1))
  
      const topic = await bloomCompletion(topicPrompt, 35, true);
      
      let rules = await openFile('AI_ResponseRule.txt')
      rules = rules.replace('<<viewer_name>>', viewerName).replace('<<time>>', timestring);
  
      let expectedResponse = await openFile('AI_ExpectedResponse.txt')

      async function workerTaskDone () {
        notes += `\n${personalitiesBlock}`;
        prompt = prompt.replace("<<TOPIC>>", topic).replace('<<NOTES>>', notes).replace('<<MOOD>>', mood).replace('<<EXPECTED>>', expectedResponse).replace('<<QUESTION>>', `${recent}\n${viewerName}: ${a}`).replace('<<RULE>>', rules).replace('<<persona>>', AIChar.characterPersona).replace('<<INTERVIEWER1>>', AIChar.interviewer).replace('<<AIChar>>', AIChar.characterInfo).replace('<<INTERVIEWER2>>', AIChar.interviewer).replace('<<AI1>>', AIChar.characterName).replace('<<AI2>>', AIChar.characterName);
      
        console.log(`${AIChar.characterName} is Thinking of an answer ...`)
        // generate response, vectorize, save, etc
        const output = await gpt3Completion(prompt, 'text-davinci-003', 1, 1, 250, 2, 2)
        timestamp = Date.now();
        vector = await gpt3Embedding(output)
        timestring = timestampToDatetime(timestamp)
    
    
        const outputSplit = output.split('\n').filter(x => x);
        message = `"${outputSplit[1]}" - Said by ${AIChar.characterName} at ${timestring}`;
        rawMessage = `${outputSplit[1]}`;
        info = {'speaker': `${AIChar.characterName}`, 'time': timestamp, 'vector': vector, 'message': message, rawMessage, 'uuid': uuidv4(), 'timestring': timestring}
        filename = "log_" + timestamp + `_${AIChar.characterName}.json`;
        console.log(outputSplit, 'outputsplit')
        let answerOnly = ''
        if (outputSplit.length == 2) {
          answerOnly = outputSplit[1].replace(`${AIChar.characterName}'s Answer:`, "").replace(/['"]+/g, '');
        }
        const moodOnly = outputSplit[0].toUpperCase().replace(`${(AIChar.characterName).toUpperCase()}'S MOOD:`, "");
        mood = moodOnly;
        console.log(mood.trim())
        const synthesizedMood = synthesizeMood(mood.trim().toUpperCase())
        console.log(synthesizedMood);
    
        await saveJson(`memories_logs/${filename}`, info);
    
        console.log("Synthesizing Speech ...")
        console.log("");
        console.log("Acquired episodic memories: ");
        console.log(notes);
        console.log("");
        console.log(totalPrompts);
        exec(`cd TTS & GPT-AZ-TTS.exe "${text}?, ${answerOnly}" "${synthesizedMood}"`, (error, stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`);
            return;
          }
          console.log(stdout)
          return main();
        });
        console.log(output);
      }

      function check() {
          if (typeof notes == 'string') {
              workerTaskDone();
              // We don't need to interval the check function anymore,
              // clearInterval will stop its periodical execution.
              clearInterval(interval);
          }
      }
      
      // Create an instance of the check function interval
      let interval = setInterval(check, 500);
    })
  }
  else {
    summarizeMemories(workerData)
  }
}

main();