import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../common/pagination';
import { ORDER_STATUSES, OrderStatus } from './order.entity';

export class OrderLineDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}

export class CreateOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerLabel?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items: OrderLineDto[];
}

export class UpdateOrderDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerLabel?: string;
}

export class ListOrdersDto extends PaginationDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;
}
