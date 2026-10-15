// A build-time deployment choice. Native Sites always keeps its own authentication.
export const emailSignIn=import.meta.env.AFFIMARO_SELF_HOSTED===true;
