import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { prisma } from '@/lib/db';
import type { NextAuthConfig, Session, User } from 'next-auth';

// Email allowlist - only these emails can access the app
const ALLOWED_EMAILS =
  process.env.ALLOWED_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) || [];

const config: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
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
    async session({ session }: { session: Session }) {
      // Add user ID to session
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true },
        });
        if (dbUser) {
          session.user.id = dbUser.id;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
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
