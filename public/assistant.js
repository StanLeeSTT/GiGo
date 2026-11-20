const api=window.GIGO_API,form=document.querySelector("#assistant-form"),input=document.querySelector("#assistant-input"),feed=document.querySelector("#assistant-feed"),status=document.querySelector("#assistant-status"),voiceBtn=document.querySelector("#voice-button"),speakToggle=document.querySelector("#speak-toggle");let conversation=null,listening=false,recognition=null;function bubble(text,kind="assistant"){const el=document.createElement("div");el.className="chat-bubble "+kind;el.textContent=text;feed.appendChild(el);feed.scrollTop=feed.scrollHeight;return el;}function speak(text){if(!("speechSynthesis" in window)||!speakToggle.checked)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=1;u.pitch=1;const voices=speechSynthesis.getVoices();const preferred=voices.find(v=>/^en(-|_)/i.test(v.lang)&&/natural|google|microsoft/i.test(v.name))||voices.find(v=>/^en/i.test(v.lang));if(preferred)u.voice=preferred;speechSynthesis.speak(u);}async function send(text){if(!text.trim())return;bubble(text,"user");const wait=bubble("GiGo is thinking…","thinking");status.textContent="Processing your request";try{const result=await api.request("/api/v1/assistant/chat",{method:"POST",body:JSON.stringify({message:text,conversation_id:conversation})});conversation=result.conversation_id;wait.remove();bubble(result.message);status.textContent="Connected · "+(result.provider||"AI provider")+" · "+(result.model||"")+(result.key_id?" · key "+result.key_id:"");speak(result.message);}catch(e){wait.textContent=e.message;status.textContent="Assistant unavailable";}}form.addEventListener("submit",e=>{e.preventDefault();const value=input.value.trim();input.value="";send(value);});function setupSpeech(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){voiceBtn.disabled=true;voiceBtn.textContent="Voice input unavailable";status.textContent="Speech recognition is not available in this browser. Try Chrome on Android or use text chat.";return;}recognition=new SR();recognition.lang=navigator.language||"en-NG";recognition.interimResults=true;recognition.continuous=false;let finalText="";recognition.onstart=()=>{listening=true;voiceBtn.classList.add("listening");voiceBtn.textContent="Listening… tap to stop";status.textContent="Listening to your voice";};recognition.onresult=e=>{let interim="";for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=t;else interim+=t;}input.value=(finalText+" "+interim).trim();};recognition.onerror=e=>status.textContent="Speech recognition: "+e.error;recognition.onend=()=>{listening=false;voiceBtn.classList.remove("listening");voiceBtn.textContent="Start voice conversation";const spoken=finalText.trim();finalText="";if(spoken)send(spoken);};voiceBtn.addEventListener("click",()=>{if(listening)recognition.stop();else{finalText="";input.value="";try{recognition.start();}catch{status.textContent="Microphone is busy. Try again.";}}});}setupSpeech();api.request("/api/v1/assistant/providers").then(p=>{status.textContent=p.configured?"AI pool ready · "+p.providers.length+" providers":"AI provider pool not configured yet";}).catch(()=>status.textContent="Sign in to use GiGo.");document.querySelector("#clear-chat").addEventListener("click",()=>{feed.innerHTML='<div class="chat-bubble assistant">Hello. I am GiGo. Start by telling me what you want to accomplish.</div>';conversation=null;window.speechSynthesis?.cancel();});

const historyFile=document.querySelector("#history-file"),historyButton=document.querySelector("#history-import-button"),historyStatus=document.querySelector("#history-import-status");
function chatGPTText(content){
  if(!content||typeof content!=="object")return "";
  if(Array.isArray(content.parts))return content.parts.map(part=>typeof part==="string"?part:(part&&typeof part.text==="string"?part.text:"")).filter(Boolean).join("\n").trim();
  if(typeof content.text==="string")return content.text.trim();
  return "";
}
function normalizeChatGPTConversation(conversation,index){
  const conversationId=String(conversation.id||conversation.conversation_id||"").trim();
  const mapping=conversation.mapping&&typeof conversation.mapping==="object"?conversation.mapping:{};
  const messages=Object.values(mapping).map(node=>node&&node.message).filter(Boolean).map(message=>{
    const role=message.author&&message.author.role;
    if(role!=="user"&&role!=="assistant")return null;
    const content=chatGPTText(message.content);
    if(!content)return null;
    const stamp=Number(message.create_time);
    return {id:String(message.id||"").trim(),role,content,created_at:Number.isFinite(stamp)&&stamp>0?new Date(stamp*1000).toISOString():undefined,_sort:Number.isFinite(stamp)?stamp:0};
  }).filter(message=>message&&message.id).sort((a,b)=>a._sort-b._sort).map(({_sort,...message})=>message);
  return {id:conversationId||"conversation-"+index,title:String(conversation.title||"Imported ChatGPT conversation").slice(0,160),created_at:Number.isFinite(Number(conversation.create_time))?new Date(Number(conversation.create_time)*1000).toISOString():undefined,messages};
}
async function importChatGPTHistory(){
  const selected=Array.from(historyFile?.files||[]);
  if(!selected.length){historyStatus.textContent="Choose one or more conversation JSON files first.";return;}
  if(selected.some(file=>file.size>200*1024*1024)){historyStatus.textContent="One of the selected files is over 200 MB. Split it into smaller JSON files.";return;}
  historyButton.disabled=true;historyFile.disabled=true;historyStatus.textContent="Reading export…";
  try{
    let conversationCount=0,messageCount=0,skippedCount=0,emptyCount=0;
    for(let fileIndex=0;fileIndex<selected.length;fileIndex++){
      const file=selected[fileIndex];
      historyStatus.textContent="Reading file "+(fileIndex+1)+" of "+selected.length+"…";
      const parsed=JSON.parse(await file.text());
      const conversations=Array.isArray(parsed)?parsed:(Array.isArray(parsed.conversations)?parsed.conversations:null);
      if(!conversations)throw new Error(file.name+" is not a supported ChatGPT conversations JSON file.");
      for(let i=0;i<conversations.length;i++){
        const conversation=normalizeChatGPTConversation(conversations[i],conversationCount+i);
        if(!conversation.messages.length){emptyCount++;continue;}
        for(let start=0;start<conversation.messages.length;start+=60){
          const batch=conversation.messages.slice(start,start+60);
          const result=await api.request("/api/v1/assistant/history/import",{method:"POST",body:JSON.stringify({chatgpt_conversation_id:conversation.id,title:conversation.title,created_at:conversation.created_at,messages:batch})});
          messageCount+=Number(result.imported||0);skippedCount+=Number(result.skipped_duplicates||0);
        }
        conversationCount++;
        historyStatus.textContent="Processed "+conversationCount+" conversations · "+messageCount+" messages saved";
      }
    }
    historyStatus.textContent="Finished: "+conversationCount+" conversations processed, "+messageCount+" messages imported, "+skippedCount+" duplicates skipped, "+emptyCount+" empty conversations skipped.";
    historyFile.value="";
  }catch(error){historyStatus.textContent="Import stopped: "+(error?.message||"Unknown error")+". You can safely select the same files again; already saved messages will be skipped.";}
  finally{historyButton.disabled=false;historyFile.disabled=false;}
}
historyButton?.addEventListener("click",importChatGPTHistory);
