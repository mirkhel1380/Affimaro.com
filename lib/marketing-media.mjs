const photos={
 partnerships:{name:'partnerships',alt:'Two professionals reviewing a plan together in a bright studio'},
 creators:{name:'creators',alt:'An independent creator preparing a camera beside a laptop'},
 technology:{name:'technology',alt:'A developer working on a laptop in a quiet studio'},
 support:{name:'support',alt:'A support professional with a headset and laptop'},
};
export function interiorPhoto(path){return photos[/creator|affiliate/.test(path)?'creators':/integration|tracking|reporting|website|woocommerce|shopify|install/.test(path)?'technology':/contact|help|privacy|resources|payments/.test(path)?'support':'partnerships'];}
export function interiorPhotoMarkup(path){const photo=interiorPhoto(path);return `<figure class="m-interior-photo"><img src="/images/page-${photo.name}.webp" srcset="/images/page-${photo.name}-small.webp 600w, /images/page-${photo.name}.webp 1104w" sizes="(max-width: 800px) calc(100vw - 40px), 43vw" width="1104" height="736" decoding="async" alt="${photo.alt}"></figure>`;}
export function decorateMarketingHero(path,body){
 if(path==='/')return body;const photo=interiorPhotoMarkup(path);
 if(path==='/contact')return body.replace('</h1>','</h1>'+photo);
 if(path==='/pricing')return body.replace(/<div class="section-heading">([\s\S]*?<\/p>)<\/div>/,(_,copy)=>`<div class="section-heading m-pricing-photo-hero"><div class="m-interior-copy">${copy}</div>${photo}</div>`);
 if(/<section class="m-page-hero[^\"]*">/.test(body))return body.replace(/<section class="(m-page-hero[^\"]*)">([\s\S]*?)<\/section>/,(_,classes,copy)=>`<section class="${classes} m-interior-hero"><div class="m-interior-copy">${copy}</div>${photo}</section>`);
 if(/<article class="container m-guide"><header>/.test(body))return body.replace(/(<article class="container m-guide">)<header>([\s\S]*?)<\/header>/,(_,article,copy)=>`${article}<header class="m-guide-photo-hero"><div class="m-interior-copy">${copy}</div>${photo}</header>`);
 return body;
}
