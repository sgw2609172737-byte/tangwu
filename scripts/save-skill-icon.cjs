'use strict';
// Preserve each generated original; create a separate, uncropped web delivery copy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'public/assets/skills/individual-v3');
const [id,source]=process.argv.slice(2),briefs=require(path.join(directory,'briefs.json'));
if(!briefs.skills.some(s=>s.id===id)||!source)throw Error('Supply a known skill id and its generated PNG path');
const input=fs.realpathSync(source),generated=path.resolve(process.env.CODEX_HOME||path.join(process.env.USERPROFILE,'.codex'),'generated_images');
if(!input.startsWith(generated+path.sep)||path.extname(input).toLowerCase()!=='.png')throw Error('Expected a built-in generated PNG');
const originals=path.join(root,'output/artwork/skill-icons-v3');fs.mkdirSync(originals,{recursive:true});
const raw=path.join(originals,id+'.png'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(fs.existsSync(raw)&&sha(fs.readFileSync(raw))!==sha(fs.readFileSync(input)))fs.copyFileSync(raw,path.join(originals,`${id}-previous-${Date.now()}.png`));
fs.copyFileSync(input,raw);
const search=[process.env.TANGWU_IMAGE_NODE_MODULES,path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')].filter(Boolean);
const sharp=require(require.resolve('sharp',{paths:search}));
(async()=>{
 const metadata=await sharp(raw).metadata();
 if(Math.abs(metadata.width/metadata.height-1)>.08)throw Error('Generated icon must be square');
 const file=id+'.webp';
 // Only resize/encode for delivery. No redraw, background removal, compositing or crop.
 await sharp(raw).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).webp({quality:88,effort:6}).toFile(path.join(directory,file));
 const manifestFile=path.join(directory,'generated.json');let manifest={version:3,generator:'built-in image_gen',strategy:'one independent image request per skill',icons:{}};
 if(fs.existsSync(manifestFile))manifest=JSON.parse(fs.readFileSync(manifestFile));
 manifest.icons[id]={name:briefs.skills.find(s=>s.id===id).name,file,original:`output/artwork/skill-icons-v3/${id}.png`,sourceWidth:metadata.width,sourceHeight:metadata.height,sha256:sha(fs.readFileSync(path.join(directory,file)))};
 fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({id,count:Object.keys(manifest.icons).length,file,bytes:fs.statSync(path.join(directory,file)).size}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
