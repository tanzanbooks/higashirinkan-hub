'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const node = (tag, text, cls) => { const e=document.createElement(tag); if(text)e.textContent=text; if(cls)e.className=cls; return e; };
  const center=[35.5205,139.4386], area=[[35.490,139.400],[35.550,139.475]];
  let map, client, uid, selected, selectedPin, photoBlob, photoPreviewUrl, rows=[], loadingVersion=0, busy=false, ready=false;
  const dialog=$('memory-compose'), photoDialog=$('memory-photo');
  function status(text,error=false){$('map-status').textContent=text;$('map-status').dataset.error=String(error);}
  function formStatus(text){$('memory-submit-status').textContent=text;}
  const config=window.MEMORY_MAP_CONFIG||{};
  for(const id of ['map-home','map-expand','map-center-post'])$(id).disabled=true;
  function configValid(){return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl||'')&&(config.publishableKey||'').startsWith('sb_publishable_');}
  function dateLabel(value){return new Date(value).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'});}
  function safePhoto(path){return typeof path==='string'&&/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(path);}
  function photoUrl(path){return safePhoto(path)&&client?client.storage.from('memory-photos').getPublicUrl(path).data.publicUrl:null;}
  function expand(on){$('map-shell').classList.toggle('is-expanded',on);$('map-expand').setAttribute('aria-expanded',String(on));document.body.style.overflow=on?'hidden':'';setTimeout(()=>map.invalidateSize(),50);}
  function closeCompose(){if(busy)return;dialog.close();if(selectedPin){map.removeLayer(selectedPin);selectedPin=null;}}
  function clearPhoto(){photoBlob=null;if(photoPreviewUrl)URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl=null;$('memory-file').value='';$('memory-preview').hidden=true;$('memory-preview').removeAttribute('src');$('memory-clear-photo').hidden=true;}
  function chooseLocation(latlng){
    if(busy)return;
    if($('memory-read').open)$('memory-read').close();
    if(latlng.lat<area[0][0]||latlng.lat>area[1][0]||latlng.lng<area[0][1]||latlng.lng>area[1][1]){status('東林間周辺の場所を選んでください。');return;}
    selected={lat:Number(latlng.lat.toFixed(6)),lng:Number(latlng.lng.toFixed(6))};
    if(selectedPin)map.removeLayer(selectedPin);
    selectedPin=L.circleMarker([selected.lat,selected.lng],{radius:12,color:'#a64135',fillOpacity:.2}).addTo(map);
    $('memory-form').reset();clearPhoto();formStatus('');$('selected-place').textContent='選んだ場所：'+selected.lat.toFixed(5)+', '+selected.lng.toFixed(5);
    $('memory-submit').disabled=!ready;dialog.showModal();
    if(!ready)formStatus('共有投稿の準備中です。保存先の接続後に投稿できます。');
  }
  function showPhoto(row){const url=photoUrl(row.photo_path);if(!url)return;$('memory-photo-img').src=url;$('memory-photo-img').alt=row.title;$('memory-photo-caption').textContent=row.title+(row.era?' / '+row.era:'');photoDialog.showModal();}
  async function deletePost(row,button){
    if(!client||!uid||row.user_id!==uid)return;
    if(!window.confirm('この思い出を削除しますか？'))return;
    button.disabled=true;
    try{
      const {data,error}=await client.from('memory_posts').delete().eq('id',row.id).eq('user_id',uid).select('id');
      if(error)throw error;if(!data?.length)throw new Error('delete');
      if(safePhoto(row.photo_path)){const removed=await client.storage.from('memory-photos').remove([row.photo_path]);if(removed.error)status('投稿は削除しました。写真の削除に失敗したため、管理者へご連絡ください。',true);}
      await loadPosts();
    }catch{status('削除できませんでした。通信を確認して、もう一度お試しください。',true);}finally{button.disabled=false;}
  }
  function postCard(row,withLocation=true){
    const card=node('article',null,'memory-post');
    const url=photoUrl(row.photo_path);
    if(url){const image=node('img');image.src=url;image.alt=row.title;image.loading='lazy';image.tabIndex=0;image.addEventListener('click',()=>showPhoto(row));image.addEventListener('keydown',e=>{if(e.key==='Enter')showPhoto(row);});card.append(image);}
    card.append(node('p',(row.era||'年代不明')+' / '+row.nickname,'memory-meta'),node('h3',row.title),node('p',row.body),node('p','投稿日：'+dateLabel(row.created_at),'memory-meta'));
    const controls=node('div',null,'post-controls');
    if(withLocation){const at=node('button','地図で見る ↗');at.type='button';at.addEventListener('click',()=>{map.setView([row.lat,row.lng],18);$('map-shell').scrollIntoView({behavior:'smooth',block:'start'});showPopup(row);});controls.append(at);}
    const add=node('button','この場所に思い出を追加');add.type='button';add.addEventListener('click',()=>chooseLocation({lat:row.lat,lng:row.lng}));controls.append(add);
    if(uid&&row.user_id===uid){const del=node('button','削除','delete-post');del.type='button';del.addEventListener('click',()=>deletePost(row,del));controls.append(del);}
    card.append(controls);return card;
  }
  function showPopup(row){const box=node('div');box.append(node('strong',row.title),node('p',(row.era||'年代不明')+' / '+row.nickname));const related=rows.filter(x=>Math.abs(x.lat-row.lat)<0.00001&&Math.abs(x.lng-row.lng)<0.00001);const b=node('button','思い出を読む'+(related.length>1?'（'+related.length+'件）':''));b.addEventListener('click',()=>{const content=$('memory-read-content');content.replaceChildren(...(related.length?related:[row]).map(x=>postCard(x,false)));$('memory-read').showModal();});box.append(b);L.popup().setLatLng([row.lat,row.lng]).setContent(box).openOn(map);}
  let markers;
  function renderPosts(){
    markers.clearLayers();$('memory-list').replaceChildren();
    const visible=rows.filter(row=>$('memory-filter').value!=='photos'||!!row.photo_path);
    const grouped=new Map();for(const row of visible){const key=row.lat.toFixed(5)+','+row.lng.toFixed(5);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
    for(const group of grouped.values()){const row=group[0];const icon=L.divIcon({className:'memory-marker'+(group.some(x=>x.photo_path)?' photo-pin':''),html:group.length>1?String(group.length):'',iconSize:[20,20],iconAnchor:[10,10]});L.marker([row.lat,row.lng],{icon,title:row.title,keyboard:true}).on('click',()=>showPopup(row)).addTo(markers);}
    // The map includes all fetched pins; a short list avoids a long mobile page.
    for(const row of visible.slice(0,12))$('memory-list').append(postCard(row));
    $('memory-count').textContent=visible.length?`表示範囲の思い出：${visible.length}件（一覧は新しい12件）`:'この範囲の思い出';
    if(!visible.length)$('memory-list').append(node('p',ready?'まだ投稿がありません。最初の思い出を残してみませんか。':'地図を動かして、思い出の場所を探してみよう。','empty-map'));
  }
  async function loadPosts(){
    if(!client)return;const version=++loadingVersion,b=map.getBounds();
    try{
      const {data,error}=await client.from('memory_posts').select('id,user_id,nickname,title,body,era,lat,lng,photo_path,created_at').gte('lat',b.getSouth()).lte('lat',b.getNorth()).gte('lng',b.getWest()).lte('lng',b.getEast()).order('created_at',{ascending:false}).limit(500);
      if(version!==loadingVersion)return;if(error)throw error;rows=data||[];renderPosts();
      status(rows.length===500?'表示範囲の新しい500件を表示しています。拡大すると範囲を絞れます。':'場所をタッチして、思い出を残せます。');
    }catch{if(version===loadingVersion)status('投稿を読み込めませんでした。「更新」で再試行してください。',true);}
  }
  async function identity(){
    const {data,error}=await client.auth.getSession();if(error)throw error;
    if(data.session){uid=data.session.user.id;return;}
    const signed=await client.auth.signInAnonymously();if(signed.error)throw signed.error;uid=signed.data.user.id;
  }
  async function shrinkPhoto(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPEG・PNG・WebPの写真を選んでください。HEICはJPEGに変換してください。');
    if(file.size>15*1024*1024)throw new Error('写真は15MB以内で選んでください。');
    const bitmap=await createImageBitmap(file),scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));if(!blob||blob.size>5*1024*1024)throw new Error('写真を小さくできませんでした。別の写真をお試しください。');return blob;
  }
  $('memory-file').addEventListener('change',async()=>{clearPreviewOnly();const file=$('memory-file').files[0];if(!file)return;busy=true;$('memory-submit').disabled=true;formStatus('写真を準備しています…');try{photoBlob=await shrinkPhoto(file);photoPreviewUrl=URL.createObjectURL(photoBlob);$('memory-preview').src=photoPreviewUrl;$('memory-preview').hidden=false;$('memory-clear-photo').hidden=false;formStatus('');}catch(e){$('memory-file').value='';formStatus(e.message);}finally{busy=false;$('memory-submit').disabled=!ready;}});
  function clearPreviewOnly(){photoBlob=null;if(photoPreviewUrl)URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl=null;$('memory-preview').hidden=true;$('memory-clear-photo').hidden=true;}
  $('memory-clear-photo').addEventListener('click',clearPhoto);
  $('memory-form').addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!ready||!selected)return;
    const title=$('memory-title').value.trim(),body=$('memory-body').value.trim(),nickname=$('memory-name').value.trim()||'まちの人',era=$('memory-era').value.trim();
    if(!title||!body){formStatus('見出しと思い出を入力してください。');return;}
    busy=true;$('memory-submit').disabled=true;formStatus('投稿を保存しています…');let path=null,inserted=false;
    try{
      await identity();
      if(photoBlob){path=uid+'/'+crypto.randomUUID()+'.jpg';const upload=await client.storage.from('memory-photos').upload(path,photoBlob,{contentType:'image/jpeg',upsert:false});if(upload.error)throw upload.error;}
      const result=await client.from('memory_posts').insert({user_id:uid,nickname,title,body,era:era||null,lat:selected.lat,lng:selected.lng,photo_path:path});if(result.error)throw result.error;
      inserted=true;busy=false;closeCompose();clearPhoto();await loadPosts();status('思い出を投稿しました。みんなの地図に表示されます。');
    }catch{
      if(path&&!inserted){try{await client.storage.from('memory-photos').remove([path]);}catch{}}
      formStatus('投稿できませんでした。入力は残っています。通信や保存先の設定を確認して、再度お試しください。');
    }finally{busy=false;$('memory-submit').disabled=!ready;}
  });
  $('memory-close').addEventListener('click',closeCompose);dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();else if(selectedPin){map.removeLayer(selectedPin);selectedPin=null;}});
  for(const id of ['memory-photo','memory-read'])$(id+'-close').addEventListener('click',()=>$(id).close());
  $('map-expand').addEventListener('click',()=>expand(true));$('map-exit').addEventListener('click',()=>expand(false));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('map-shell').classList.contains('is-expanded')&&!dialog.open&&!photoDialog.open&&!$('memory-read').open)expand(false);});
  $('map-home').addEventListener('click',()=>map.setView(center,16));$('map-center-post').addEventListener('click',()=>chooseLocation(map.getCenter()));$('map-refresh').addEventListener('click',loadPosts);$('memory-filter').addEventListener('change',renderPosts);
  async function init(){
    if(!window.L){status('地図を読み込めませんでした。通信を確認して再読み込みしてください。',true);return;}
    map=L.map('memory-map',{minZoom:13,maxZoom:19,maxBounds:area,maxBoundsViscosity:.8,touchZoom:true,doubleClickZoom:false}).setView(center,16);
    const tile=L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',{maxNativeZoom:18,maxZoom:19,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>（淡色地図を白黒加工）'}).addTo(map);
    tile.on('tileerror',()=>{$('map-tile-error').hidden=false;});
    markers=L.layerGroup().addTo(map);
    for(const id of ['map-home','map-expand','map-center-post'])$(id).disabled=false;
    L.marker(center,{interactive:false,icon:L.divIcon({className:'station-label',html:'東林間駅',iconSize:[75,25],iconAnchor:[37,12]})}).addTo(map);
    map.on('click',e=>chooseLocation(e.latlng));let timer;map.on('moveend',()=>{clearTimeout(timer);timer=setTimeout(loadPosts,350);});
    if(!configValid()||!window.supabase){status('共有投稿の準備中です。地図の拡大・場所選びはお試しいただけます。');renderPosts();return;}
    client=window.supabase.createClient(config.supabaseUrl,config.publishableKey);
    // Reading is public. Sign in only when somebody actually posts.
    const session=await client.auth.getSession();if(!session.error)uid=session.data.session?.user.id||null;
    ready=true;$('map-refresh').disabled=false;await loadPosts();
  }
  init().catch(()=>status('地図の準備に失敗しました。再読み込みしてください。',true));
})();
