import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dbCheck = await query('SELECT NOW() AS now, current_database() AS db_name, version() AS pg_version');
    const tenantsCount = await query('SELECT COUNT(*) AS total_tenants FROM tenants');
    const usersCount = await query('SELECT COUNT(*) AS total_users FROM users');

    return NextResponse.json({
      status: 'healthy',
      app: 'Munirix',
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: true,
        name: dbCheck.rows[0].db_name,
        timestamp: dbCheck.rows[0].now,
        postgres_version: dbCheck.rows[0].pg_version,
      },
      stats: {
        tenants: parseInt(tenantsCount.rows[0].total_tenants, 10),
        users: parseInt(usersCount.rows[0].total_users, 10),
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Fallo al conectar con la base de datos PostgreSQL.',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

