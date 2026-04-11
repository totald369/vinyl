import Script from "next/script";
import { CLARITY_PROJECT_ID } from "@/lib/clarity";

/**
 * Microsoft Clarity — <head>에 삽입 (루트 layout).
 * 공식 스니펫과 동일한 IIFE, 프로젝트 ID는 lib/clarity.
 */
export function MicrosoftClarityScripts() {
  if (!CLARITY_PROJECT_ID) {
    return null;
  }

  const id = CLARITY_PROJECT_ID;
  const inline = `
(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${id}");
`.trim();

  return (
    <Script
      id="microsoft-clarity-init"
      strategy="lazyOnload"
      dangerouslySetInnerHTML={{ __html: inline }}
    />
  );
}
