import { Controller, Request, Post, UseGuards, Get, Body, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import type { LoginDto } from '../services/auth.service';
import { LocalAuthGuard } from '../auth/local-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    try {
      return await this.authService.login(loginDto);
    } catch (error) {
      if (error.message === 'Credenciais inválidas' || error.message === 'Empresa inativa') {
        throw new HttpException(error.message, HttpStatus.UNAUTHORIZED);
      }
      throw new HttpException('Erro interno do servidor', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req) {
    try {
      return await this.authService.getProfile(req.user.id);
    } catch (error) {
      throw new HttpException('Erro ao buscar perfil do usuário', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout() {
    // Para JWT stateless, o logout é feito no frontend removendo o token
    // Aqui podemos implementar uma blacklist de tokens se necessário
    return { message: 'Logout realizado com sucesso' };
  }
}