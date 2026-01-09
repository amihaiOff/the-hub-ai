import NextAuth from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db';
import type { NextAuthConfig, Session, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

// Email allowlist - only these emails can access the app
const ALLOWED_EMAILS =
  process.env.ALLOWED_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) || [];

const config: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || 'The Hub AI <noreply@resend.dev>',
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async signIn({ user }: { user: User }) {
      // Check if user's email is in the allowlist
      const email = user.email?.toLowerCase();
      if (!email) return false;

      // If allowlist is empty (not configured), deny all for security
      if (ALLOWED_EMAILS.length === 0) {
        console.warn('ALLOWED_EMAILS not configured - denying all sign-ins');
        return false;
      }

      if (!ALLOWED_EMAILS.includes(email)) {
        console.warn(`Sign-in denied for email: ${email}`);
        return false;
      }

      // Upsert user in database
      await prisma.user.upsert({
        where: { email },
        update: {
          name: user.name,
          image: user.image,
        },
        create: {
          email,
          name: user.name,
          image: user.image,
        },
      });

      return true;
    },
    async jwt({ token, user }: { token: JWT; user?: User }) {
      // On initial sign-in, user object is available - look up database user ID
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true },
        });
        if (dbUser) {
          token.userId = dbUser.id;
        }
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      // Pass user ID from token to session
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify-request',
    error: '/auth/error',
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);

// Extend the Session type to include user ID
declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

// Extend the JWT type to include userId
declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
  }
}
