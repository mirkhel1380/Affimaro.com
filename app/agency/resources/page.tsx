import {ProgramResourcesView} from '../../program-resources-view';
import type {PortalPageQuery} from '../../../lib/portal-return-path';
export const dynamic='force-dynamic';
export default function Page({searchParams}:{searchParams:Promise<PortalPageQuery>}){return ProgramResourcesView({portal:'agency',searchParams});}
