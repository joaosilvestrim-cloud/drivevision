import {readFileSync} from 'node:fs';
import { Client } from 'pg';
process.loadEnvFile('.env.local');
const client = new Client({host:process.env.DRIVEVISION_DB_HOST,port:Number(process.env.DRIVEVISION_DB_PORT),database:process.env.DRIVEVISION_DB_DATABASE,user:process.env.DRIVEVISION_DB_ADMIN_USER,password:process.env.DRIVEVISION_DB_ADMIN_PASSWORD,ssl:{rejectUnauthorized:true,ca:readFileSync(new URL("../server/certs/supabase-ca.crt",import.meta.url),"utf8")},connectionTimeoutMillis:10000,statement_timeout:10000});
try {
  await client.connect();
  const result=await client.query("select table_schema, count(*)::int as tables from information_schema.tables where table_schema not in ('pg_catalog','information_schema') group by table_schema order by table_schema");
  console.log(JSON.stringify({connected:true,schemas:result.rows}));
} catch(error) {console.error(JSON.stringify({connected:false,code:error.code||'CONNECTION_ERROR',message: /password|authentication/i.test(error.message)?'Authentication failed':error.message}));process.exitCode=1;} finally {await client.end();}

