// import { Configuration, OpenAIApi } from 'openai'

const { Configuration, OpenAIApi } = require('openai');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const AIChar = require('./AI_Characteristics.json')
const { exec } = require("child_process");
const readline = require("readline");

const configuration = new Configuration({
    apiKey: "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"
  });
  
const openai = new OpenAIApi(configuration);

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

// function saveJson(filepath, payload) {
//     fs.writeFile(filepath, JSON.stringify(payload, null, 2), 'utf8', (err) => {
//         if (err) throw err;
//     });
// }

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

async function summarizeMemories(memories) {
    memories = memories.sort((a, b) => new Date(a.time) - new Date(b.time));
    let block = '';
    const identifiers = [];
    const timestamps = [];
    memories.forEach((mem) => {
      block += `${mem.message} \n`;
      identifiers.push(mem.uuid);
      timestamps.push(mem.time);
    });
    block = block.trim();
    let prompt = await openFile('prompt_notes.txt')
    prompt = prompt.replace('<<INPUT>>', block)
    const notes = await gpt3Completion(prompt);
    const vector = await gpt3Embedding(block);
    const info = {
      notes: notes,
      uuids: identifiers,
      times: timestamps,
      uuid: uuidv4(),
      vector,
    };
    const filename = `notes_${Date.now()}.json`;
    await saveJson(`notes/${filename}`, info);
    return notes;
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
      output += `${c.message}\n\n`;
    });
    return output.trim();
  };

let mood = 'Snarky';
let viewerName = 'Az';

async function main () {
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question("Enter CHAT: >> ", async function (text) {
      rl.close();
      const a = `"${text}" \n`
      let timestamp = Date.now();
      let vector = await gpt3Embedding(a);

      // load conversation
      console.log("Opening Brain ...")
      const conversation = await loadConvo();
      let timestring = timestampToDatetime(timestamp)
      let message = `${viewerName}: ${timestring} - ${a}`;
      let newUUID = uuidv4();
      let info = {'speaker': viewerName, 'time': timestamp, 'vector': vector, 'message': message, 'uuid': newUUID, 'timestring': timestring}
      let filename = "log_" + timestamp + `_${viewerName}.json`;
      await saveJson(`memories_logs/${filename}`, info);

      // compose corpus (fetch memories, etc)
      const memories = fetchMemories(vector, conversation, 7) // pull episodic memories

      // Fetch declarative memories (facts, questions, events)
      console.log("Fetching Episodic Memories ...")
      const notes = await summarizeMemories(memories)

      // Get recent conversations
      const recent = getLastMessages(conversation, 5)
      let prompt = await openFile('prompt_response.txt')
      let topicPrompt = await openFile('search_topic.txt')
      topicPrompt = topicPrompt.replace("<<PREVIOUS_CHAT>>", getLastMessages(conversation, 1))
      let rules = await openFile('AI_ResponseRule.txt')
      rules = rules.replace('<<viewer_name>>', viewerName).replace('<<time>>', timestring);

      let expectedResponse = await openFile('AI_ExpectedResponse.txt')

      const topic = await gpt3Completion(topicPrompt);

      prompt = prompt.replace("<<TOPIC>>", topic).replace('<<NOTES>>', notes).replace('<<MOOD>>', mood).replace('<<EXPECTED>>', expectedResponse).replace('<<CONVERSATION>>', recent).replace('<<QUESTION>>', `${viewerName}: ${a}`).replace('<<RULE>>', rules).replace('<<persona>>', AIChar.characterPersona).replace('<<INTERVIEWER1>>', AIChar.interviewer).replace('<<AIChar>>', AIChar.characterInfo).replace('<<INTERVIEWER2>>', AIChar.interviewer).replace('<<AI1>>', AIChar.characterName).replace('<<AI2>>', AIChar.characterName);
      
      console.log(`${AIChar.characterName} is Thinking of an answer ...`)
      // generate response, vectorize, save, etc
      const output = await gpt3Completion(prompt, 'text-davinci-003', 1, 1, 356, 2, 2)
      timestamp = Date.now();
      vector = await gpt3Embedding(output)
      timestring = timestampToDatetime(timestamp)
  
      const outputSplit = output.split('\n').filter(x => x);
      message = `${AIChar.characterName}: ${timestring} - "${outputSplit[1]}"`;
      info = {'speaker': `${AIChar.characterName}`, 'time': timestamp, 'vector': vector, 'message': message, 'uuid': uuidv4(), 'timestring': timestring}
      filename = "log_" + timestamp + `_${AIChar.characterName}.json`;
  
      const answerOnly = outputSplit[1].replace(`${AIChar.characterName}'s Answer:`, "");
      const moodOnly = outputSplit[0].replace(`${AIChar.characterName}'s Mood:`, "");
      mood = moodOnly;
  
      await saveJson(`memories_logs/${filename}`, info);
      console.log("Synthesizing Speech ...")
      console.log("");
      console.log("Acquired episodic memories: ");
      console.log(notes);
      console.log("");
      exec(`cd TTS & GPT-AZ-TTS.exe "${answerOnly}"`, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return;
        }
        console.log(stdout)
        return main();
      });
      console.log(output);
    })
}

main();