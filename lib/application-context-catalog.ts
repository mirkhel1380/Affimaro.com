import {z} from 'zod';
export const applicationContextRetentionDays=90;
export const applicationContextHeader='x-affimaro-application-network';
export const deviceReportSchema=z.object({timeZone:z.string().max(80).optional(),language:z.string().max(40).optional(),screenWidth:z.number().int().min(1).max(32768).optional(),screenHeight:z.number().int().min(1).max(32768).optional(),viewportWidth:z.number().int().min(1).max(32768).optional(),viewportHeight:z.number().int().min(1).max(32768).optional(),pixelRatio:z.number().min(.25).max(8).optional()}).strict();
export type DeviceReport=z.infer<typeof deviceReportSchema>;
export type ApplicationRequestContext={version:1;network:{ip:string|null;country:string|null;region:string|null;city:string|null;asn:number|null;organization:string|null;httpProtocol:string|null;tlsVersion:string|null;source:'cloudflare'|'unavailable'};browser:{name:string;operatingSystem:string;deviceType:string;userAgent:string;clientHints:string;reportedPlatform:string;language:string};device:DeviceReport};
