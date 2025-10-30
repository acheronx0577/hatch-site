import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiTags,
  getSchemaPath
} from '@nestjs/swagger';

import { ErrorResponseDto } from '../dto/error-response.dto';
import { PaginatedResponseDto } from '../dto/paginated-response.dto';

export const ApiStandardErrors = () =>
  applyDecorators(
    ApiBadRequestResponse({ type: ErrorResponseDto }),
    ApiNotFoundResponse({ type: ErrorResponseDto }),
    ApiConflictResponse({ type: ErrorResponseDto }),
    ApiGoneResponse({ type: ErrorResponseDto }),
    ApiTooManyRequestsResponse({ type: ErrorResponseDto }),
    ApiInternalServerErrorResponse({ type: ErrorResponseDto })
  );

export const ApiAuthGuarded = () =>
  applyDecorators(ApiBearerAuth(), ApiUnauthorizedResponse({ type: ErrorResponseDto }), ApiForbiddenResponse({ type: ErrorResponseDto }));

export const ApiCursorPaginatedResponse = <TModel extends Type<unknown>>(model: TModel) =>
  applyDecorators(
    ApiExtraModels(PaginatedResponseDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(PaginatedResponseDto) },
          {
            properties: {
              items: {
                type: 'array',
                items: { $ref: getSchemaPath(model) }
              }
            }
          }
        ]
      }
    })
  );

export const ApiModule = (tag: string, options: { secure?: boolean } = {}) =>
  options.secure === false ? applyDecorators(ApiTags(tag)) : applyDecorators(ApiTags(tag), ApiAuthGuarded());
