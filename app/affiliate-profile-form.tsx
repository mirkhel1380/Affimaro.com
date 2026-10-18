import type {AffiliateProfile} from '../lib/service';
import {ApiForm,type Field} from './forms';

export function AffiliateProfileForm({name,profile,redirectTo='/partner',label}:{name:string;profile?:AffiliateProfile|null;redirectTo?:string;label?:string}){
  const fields:Field[]=[
    {name:'name',label:'Partner display name',value:profile?.display_name||name,required:true,maxLength:60},
    {name:'channel',label:'Your main channel',type:'select',value:profile?.channel||'Content creator',options:['Content creator','Newsletter','Community','Blog','Other']},
    {name:'website',label:'Website or public profile (optional)',type:'url',value:profile?.website||'',placeholder:'https://your-website.com'},
    {name:'bio',label:'Tell businesses about your audience',type:'textarea',value:profile?.bio||'',maxLength:500,placeholder:'The topics you cover and the people you reach.'},
  ];
  return <ApiForm endpoint="/api/affiliate" fields={fields} label={label||(profile?'Save partner profile':'Create partner profile')} redirectTo={redirectTo}/>;
}
