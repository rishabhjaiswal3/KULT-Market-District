import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from "../chatgpt-auth";
import Desk from "../desk";

export const dynamic = "force-dynamic";
export default async function ResearchDesk() {
  const user = await getChatGPTUser();
  return <Desk signedIn={Boolean(user)} displayName={user?.displayName || null} signInPath={chatGPTSignInPath("/desk")} signOutPath={chatGPTSignOutPath("/")} />;
}
