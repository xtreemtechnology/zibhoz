import "dotenv/config";
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const reflector = app.get(Reflector);

  app.set('trust proxy', 1);

  // Relax CSP for Swagger UI (inline scripts/styles required)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  const configService = app.get(ConfigService);
  const PORT = configService.get<number>('PORT') || 3001;
  const corsOrigin = configService.get<string>('CORS_ORIGIN') || 'http://localhost:3000';

  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  // Raw Express routes BEFORE global prefix
  const rawExpressApp = app.getHttpAdapter().getInstance();

  rawExpressApp.get('/', (_req: any, res: any) => {
    res.json({ status: 'ok' });
  });

  rawExpressApp.get('/api', (_req: any, res: any) => {
    res.json({
      name: 'Zibhoz API',
      version: '1.0',
      status: 'operational',
      documentation: '/api/docs',
      api: '/api/v1',
      endpoints: {
        auth: '/api/v1/auth',
        users: '/api/v1/users',
      },
    });
  });

  rawExpressApp.get('/api/info', (_req: any, res: any) => {
    res.json({
      name: 'Zibhoz API',
      version: '1.0',
      status: 'operational',
      documentation: '/api/docs',
      api: '/api/v1',
    });
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Zibhoz API')
    .setDescription('Authentication and user management API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'access-token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'refresh-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(PORT, '0.0.0.0');
  console.log(`Server running on http://localhost:${PORT}/api/v1`);
  console.log(`Swagger docs available at http://localhost:${PORT}/api/docs`);
}

bootstrap();