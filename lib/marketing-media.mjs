const photos={
"/legal": {"name": "legal-hub", "alt": "Two people reviewing paperwork at a desk"},
"/terms-and-conditions": {"name": "legal-terms", "alt": "A professional signing a contract at a desk"},
"/payment-policy": {"name": "legal-payment", "alt": "Financial documents beside a laptop"},
"/privacy-policy": {"name": "legal-privacy", "alt": "An organized desk with folders and a closed planner"},
"/fraud-policy": {"name": "legal-fraud", "alt": "A security key beside a laptop"},
"/account-policy": {"name": "legal-account", "alt": "An open notebook and tea on a sunlit desk"},
"/cookie-policy": {"name": "legal-cookies", "alt": "Hands typing at a laptop keyboard"},

 "/platform": {
  "name": "partnerships",
  "alt": "Two professionals reviewing a plan together in a bright studio"
 },
 "/creators": {
  "name": "creators",
  "alt": "An independent creator preparing a camera beside a laptop"
 },
 "/integrations": {
  "name": "technology",
  "alt": "A developer working on a laptop in a quiet studio"
 },
 "/contact": {
  "name": "support",
  "alt": "A support professional with a headset and laptop"
 },
 "/brands": {
  "name": "v2-brands",
  "alt": "A retail owner planning a launch in her product studio"
 },
 "/affiliates": {
  "name": "v2-affiliates",
  "alt": "A publisher working in a calm recording studio"
 },
 "/agencies": {
  "name": "v2-agencies",
  "alt": "An agency team planning together beside a standing board"
 },
 "/about": {
  "name": "v2-about",
  "alt": "A diverse team sharing a relaxed conversation in an office"
 },
 "/resources": {
  "name": "v2-resources",
  "alt": "Natural material samples and visual inspiration arranged on an oak table"
 },
 "/help": {
  "name": "v2-help",
  "alt": "Two colleagues discussing a laptop at a round oak table"
 },
 "/data-and-privacy": {
  "name": "v2-data-privacy",
  "alt": "A locked filing cabinet beside a desk with a closed laptop"
 },
 "/login": {
  "name": "v2-login",
  "alt": "An open oak doorway leading into a quiet office"
 },
 "/get-started": {
  "name": "v2-get-started",
  "alt": "Hands arranging blank cream onboarding cards on an oak table"
 },
 "/pricing": {
  "name": "v2-pricing",
  "alt": "A plain calculator, blank notebook and sage folder on an oak desk"
 },
 "/preview": {
  "name": "v2-preview",
  "alt": "A bright collaborative workspace seen through a glass wall"
 },
 "/install": {
  "name": "v2-install",
  "alt": "A hand holding a blank-screen smartphone beside a closed laptop"
 },
 "/features/partner-management": {
  "name": "v2-partner-management",
  "alt": "Two professionals greeting across a round meeting table"
 },
 "/features/referral-tracking": {
  "name": "v2-referral-tracking",
  "alt": "Hands arranging blank cards and green string on an oak desk"
 },
 "/features/commissions": {
  "name": "v2-commissions",
  "alt": "Hands reviewing envelopes and a calculator on a warm wooden desk"
 },
 "/features/reporting": {
  "name": "v2-reporting",
  "alt": "Two colleagues reviewing papers beside a sunlit window"
 },
 "/features/partner-resources": {
  "name": "v2-partner-resources",
  "alt": "A creator selecting plain product samples from a studio shelf"
 },
 "/features/creator-studio": {
  "name": "v2-creator-studio",
  "alt": "A creator adjusting studio lighting for a tabletop product video"
 },
 "/features/agency-directory": {
  "name": "v2-agency-directory",
  "alt": "An agency coordinator organizing blank client folders on a wall shelf"
 },
 "/integrations/woocommerce": {
  "name": "v2-woocommerce",
  "alt": "A craft shop owner tying a plain parcel beside a laptop"
 },
 "/integrations/shopify": {
  "name": "v2-shopify",
  "alt": "A boutique owner arranging scarves and accessories at a retail counter"
 },
 "/integrations/custom": {
  "name": "v2-custom",
  "alt": "Two developers collaborating across separate desks in a bright studio"
 },
 "/integrations/wordpress-admin": {
  "name": "v2-wordpress-admin",
  "alt": "A shop owner at a compact back-office workstation"
 },
 "/guides/brand-start": {
  "name": "v2-brand-start",
  "alt": "An entrepreneur opening a box of product samples"
 },
 "/guides/affiliate-start": {
  "name": "v2-affiliate-start",
  "alt": "A publisher preparing an unmarked notebook beside a camera and mug"
 },
 "/guides/payments": {
  "name": "v2-payments",
  "alt": "Hands organizing a blank card and plain invoice folder"
 },
 "/guides/agency-start": {
  "name": "v2-agency-start",
  "alt": "A consultant and business owner reviewing planning cards at a round table"
 },
 "/guides/woocommerce-setup": {
  "name": "v2-woocommerce-setup",
  "alt": "A developer helping a craft shop owner at a laptop"
 },
 "/guides/shopify-setup": {
  "name": "v2-shopify-setup",
  "alt": "A merchandiser preparing a plain package for a product photograph"
 },
 "/guides/custom-website-setup": {
  "name": "v2-custom-website-setup",
  "alt": "A laptop cable and ports beside a notebook on an oak workbench"
 },
 "/guides/creator-start": {
  "name": "v2-creator-start",
  "alt": "A creator adjusting lighting beside a plain studio backdrop"
 }
};
export function interiorPhoto(path){const route=String(path).split(/[?#]/)[0].replace(/\/$/,'')||'/';const role=route.match(/^\/auth\/(brand|affiliate|creator|agency|owner)(?:\/|$)/)?.[1];if(role)return photos[({brand:'/brands',affiliate:'/affiliates',creator:'/creators',agency:'/agencies',owner:'/integrations'})[role]];return photos[route]||photos[({'/demo/creators':'/creators','/demo/agencies':'/agencies'})[route]]||photos['/platform'];}
export function interiorPhotoMarkup(path){const photo=interiorPhoto(path);return `<figure class="m-interior-photo"><img src="/images/page-${photo.name}.webp" srcset="/images/page-${photo.name}-small.webp 600w, /images/page-${photo.name}.webp 1104w" sizes="(max-width: 800px) calc(100vw - 40px), 43vw" width="1104" height="736" decoding="async" alt="${photo.alt}"></figure>`;}
export function decorateMarketingHero(path,body){
 if(path==='/')return body;const photo=interiorPhotoMarkup(path);
 if(path==='/contact')return body.replace('</h1>','</h1>'+photo);
 if(path==='/pricing')return body.replace(/<div class="section-heading">([\s\S]*?<\/p>)<\/div>/,(_,copy)=>`<div class="section-heading m-pricing-photo-hero"><div class="m-interior-copy">${copy}</div>${photo}</div>`);
 if(/<section class="m-page-hero[^\"]*">/.test(body))return body.replace(/<section class="(m-page-hero[^\"]*)">([\s\S]*?)<\/section>/,(_,classes,copy)=>`<section class="${classes} m-interior-hero"><div class="m-interior-copy">${copy}</div>${photo}</section>`);
 if(/<article class="container m-guide[^\"]*"><header>/.test(body))return body.replace(/(<article class="container m-guide[^\"]*">)<header>([\s\S]*?)<\/header>/,(_,article,copy)=>`${article}<header class="m-guide-photo-hero"><div class="m-interior-copy">${copy}</div>${photo}</header>`);
 return body;
}
