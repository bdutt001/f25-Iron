import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prisma';

const router = Router();

// SIGNUP (email + password)
router.post('/auth/signup', async (req: Request, res: Response) => {
  const emailRaw = (req.body?.email ?? '') as string;
  const passwordRaw = (req.body?.password ?? '') as string;
  const name = typeof req.body?.name === 'string' ? req.body.name : undefined;

  const email = emailRaw.trim().toLowerCase();
  if (!email || !passwordRaw) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(passwordRaw, 10);
    const user = await prisma.user.create({
      data: { email, name, password: hashedPassword },
      select: { id: true, email: true, name: true, interestTags: true, createdAt: true },
    });
    return res.status(201).json(user);
  } catch (error) {
    console.error('Signup Error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// LOGIN (email + password)
router.post('/auth/login', async (req: Request, res: Response) => {
  const emailRaw = (req.body?.email ?? '') as string;
  const password = (req.body?.password ?? '') as string;

  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, password: true, interestTags: true, createdAt: true } as any });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, (user as any).password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const { password: _p, ...safe } = user as any;
    return res.json(safe);
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
