import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateProtocolEventDto {
  @IsOptional()
  @IsNumber()
  company_id?: number;

  @IsOptional()
  @IsString()
  company_key?: string;

  @IsOptional()
  @IsString()
  company_name?: string;

  @IsOptional()
  @IsString()
  appointment_id?: string;

  @IsOptional()
  @IsString()
  protocol?: string;

  @IsOptional()
  @IsString()
  participant_id?: string;

  @IsOptional()
  @IsString()
  cpf?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsNotEmpty()
  @IsString()
  event: string;

  @IsOptional()
  @IsString()
  next_group?: string;

  @IsOptional()
  @IsString()
  professional_id?: string;

  @IsOptional()
  @IsString()
  professional_name?: string;

  @IsOptional()
  @IsString()
  professional_license?: string;

  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @IsOptional()
  payload?: Record<string, unknown>;
}

