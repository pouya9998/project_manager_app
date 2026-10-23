import { IsArray, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class AddCommentDto {
  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  mentionIds?: number[];
}
