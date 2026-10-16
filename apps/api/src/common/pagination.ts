import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function toPage<T>(items: T[], total: number, p: PaginationDto): Page<T> {
  return { items, total, limit: p.limit, offset: p.offset };
}
