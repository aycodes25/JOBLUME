import { NextResponse, type NextRequest } from 'next/server';
import { decideRedirect } from '@/lib/route-guard';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const target = decideRedirect(request.nextUrl.pathname, user !== null);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
