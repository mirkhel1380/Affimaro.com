import {admissionAction} from '../../../../lib/admission-http';
import {requirePlatformAdmin} from '../../../../lib/admissions';
import {AppError} from '../../../../lib/service';
export async function POST(request:Request){return admissionAction(request,async(db,user)=>{await requirePlatformAdmin(db,user);throw new AppError(410,'Package approval is no longer required. Approved accounts purchase directly; verified payment activates the package.');});}
