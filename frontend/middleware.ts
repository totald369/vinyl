import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** dev에서 middleware-manifest·파이프라인을 안정적으로 잡기 위한 통과 전용 미들웨어 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"
  ]
};
