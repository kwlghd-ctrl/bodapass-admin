/**
 * companyApi — 회사(사업자) 마스터
 */

import { apiClient } from './client';
import type {
  Company,
  CreateCompanyRequest,
  ListCompaniesQuery,
  ListCompaniesResponse,
  UpdateCompanyRequest,
} from './company.types';

export const companyApi = {
  list: async (q: ListCompaniesQuery = {}): Promise<ListCompaniesResponse> => {
    const { data } = await apiClient.get<ListCompaniesResponse>('/v2/companies', { params: q });
    return data;
  },

  get: async (companyId: string): Promise<Company> => {
    const { data } = await apiClient.get<Company>(`/v2/companies/${companyId}`);
    return data;
  },

  create: async (req: CreateCompanyRequest): Promise<Company> => {
    const { data } = await apiClient.post<Company>('/v2/companies', req);
    return data;
  },

  update: async (companyId: string, req: UpdateCompanyRequest): Promise<Company> => {
    const { data } = await apiClient.patch<Company>(`/v2/companies/${companyId}`, req);
    return data;
  },
};
