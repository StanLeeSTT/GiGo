const api=window.GIGO_API,esc=api.esc,status=document.querySelector("#creative-status"),list=document.querySelector("#creative-list"),form=document.querySelector("#creative-form");
function card(item){
 const refs=Array.isArray(item.reference_urls)?item.reference_urls:[];
 return '<article class="module-workbench"><div class="workbench-state"><span class="state-dot"></span><strong>'+esc(item.status)+'</strong></div><h3>'+esc(item.title)+'</h3><p>'+esc(String(item.asset_type||"").replace(/_/g," "))+' · '+esc(item.target_platform||"No target platform")+' · '+esc(item.aspect_ratio||"Format not set")+'</p><p>'+esc(item.brief)+'</p>'+(item.generation_prompt?'<h4>Generation prompt</h4><pre class="config-sample">'+esc(item.generation_prompt)+'</pre>':'')+(refs.length?'<p>References: '+refs.map(url=>'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Open reference</a>').join(" · ")+'</p>':'')+(item.output_url?'<p><a href="'+esc(item.output_url)+'" target="_blank" rel="noopener noreferrer">Open recorded output</a></p>':'')+'<label for="creative-status-'+esc(item.id)+'">Production status</label><select id="creative-status-'+esc(item.id)+'" data-creative-status="'+esc(item.id)+'">'+["draft","ready","in_progress","complete","archived"].map(v=>'<option value="'+v+'" '+(item.status===v?"selected":"")+'>'+v.replace(/_/g," ")+'</option>').join("")+'</select><label for="creative-output-'+esc(item.id)+'">Output URL (optional HTTPS)</label><input id="creative-output-'+esc(item.id)+'" data-creative-output="'+esc(item.id)+'" type="url" maxlength="2048" value="'+esc(item.output_url||"")+'"><label for="creative-notes-'+esc(item.id)+'">Production notes</label><textarea id="creative-notes-'+esc(item.id)+'" data-creative-notes="'+esc(item.id)+'" maxlength="5000">'+esc(item.notes||"")+'</textarea><button class="secondary-button" type="button" data-save-creative="'+esc(item.id)+'">Save production update</button><small>Updated '+esc(new Date(item.updated_at||item.created_at).toLocaleString())+'</small></article>';
}
async function load(){status.textContent="Loading creative briefs…";try{const rows=await api.request("/api/v1/creative/briefs");list.innerHTML=(rows||[]).map(card).join("")||'<div class="empty-card">No creative briefs saved yet.</div>';status.textContent=(rows||[]).length+" creative brief(s) saved.";}catch(e){status.textContent="Could not load creative briefs: "+e.message;}}
form.addEventListener("submit",async e=>{
 e.preventDefault();
 const refs=document.querySelector("#creative-references").value.split("\n").map(x=>x.trim()).filter(Boolean);
 if(refs.length>20||refs.some(url=>{try{return new URL(url).protocol!=="https:";}catch{return true;}})){status.textContent="Use up to 20 valid HTTPS reference URLs.";return;}
 const payload={title:document.querySelector("#creative-title").value.trim(),asset_type:document.querySelector("#creative-type").value,target_platform:document.querySelector("#creative-platform").value.trim()||null,aspect_ratio:document.querySelector("#creative-aspect").value.trim()||null,brief:document.querySelector("#creative-brief").value.trim(),generation_prompt:document.querySelector("#creative-prompt").value.trim()||null,reference_urls:refs,notes:document.querySelector("#creative-notes").value.trim()||null};
 const button=form.querySelector("button");button.disabled=true;status.textContent="Saving creative brief…";
 try{await api.request("/api/v1/creative/briefs",{method:"POST",body:JSON.stringify(payload)});form.reset();status.textContent="Creative brief saved. No media was generated or published.";await load();}
 catch(error){status.textContent="Could not save creative brief: "+error.message;}
 finally{button.disabled=false;}
});
list.addEventListener("click",async e=>{
 const b=e.target.closest("[data-save-creative]");if(!b)return;
 const id=b.dataset.saveCreative,select=list.querySelector('[data-creative-status="'+CSS.escape(id)+'"]'),output=list.querySelector('[data-creative-output="'+CSS.escape(id)+'"]'),notes=list.querySelector('[data-creative-notes="'+CSS.escape(id)+'"]');
 if(!select||!output||!notes)return;
 if(output.value.trim()){try{if(new URL(output.value.trim()).protocol!=="https:")throw new Error();}catch{status.textContent="Output URL must be a valid HTTPS URL.";return;}}
 b.disabled=true;
 try{await api.request("/api/v1/creative/briefs?id="+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({status:select.value,output_url:output.value.trim()||null,notes:notes.value})});status.textContent="Creative production update saved. Nothing was published.";await load();}
 catch(error){status.textContent="Could not update creative brief: "+error.message;}
 finally{b.disabled=false;}
});
document.querySelector("#refresh-creative").addEventListener("click",load);
load();
