import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { Company } from '../entities/company.entity';

export interface LoginDto {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    role: string;
    company_id: number;
    company_name: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: [
        { username, is_active: true },
        { email: username, is_active: true }
      ],
      relations: ['company']
    });

    if (user && await bcrypt.compare(password, user.password_hash)) {
      // Verificar se a empresa está ativa
      const company = await this.companyRepository.findOne({
        where: { id: user.company_id, is_active: true }
      });

      if (!company) {
        throw new UnauthorizedException('Empresa inativa');
      }

      // Atualizar último login
      await this.userRepository.update(user.id, {
        last_login: new Date()
      });

      const { password_hash, ...result } = user;
      return { ...result, company_name: company.name };
    }
    return null;
  }

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const user = await this.validateUser(loginDto.username, loginDto.password);
    
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const payload = { 
      username: user.username, 
      sub: user.id,
      company_id: user.company_id,
      role: user.role
    };

    return {
      access_token: this.jwtService.sign(payload),
      token_type: 'Bearer',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        company_id: user.company_id,
        company_name: user.company_name,
      },
    };
  }

  async getProfile(userId: number): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: userId, is_active: true },
      relations: ['company']
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const { password_hash, ...result } = user;
    return {
      ...result,
      company_name: user.company?.name || 'N/A'
    };
  }
}