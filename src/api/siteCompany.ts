/**
 * siteCompanyApi — 「현장 × 회사」 관계
 */

import { apiClient } from './client';
import type {
  CreateSiteCompanyRequest,
  ListSiteCompaniesQuery,
  ListSiteCompaniesResponse,
  SiteCompany,
} from './siteCompany.types';

export const siteCompanyApi = {
  list: async (q: ListSiteCompaniesQuery = {}): Promise<ListSiteCompaniesResponse> => {
    const { data } = await apiClient.get<ListSiteCompaniesResponse>('/v2/site-companies', { params: q });
    return data;
  },

  get: async (siteCompanyId: string): Promise<SiteCompany> => {
    const { data } = await apiClient.get<SiteCompany>(`/v2/site-companies/${siteCompanyId}`);
    return data;
  },

  create: async (req: CreateSiteCompanyRequest): Promise<SiteCompany> => {
    const { data } = await apiClient.post<SiteCompany>('/v2/site-companies', req);
    return data;
  },

  terminate: async (siteCompanyId: string, endDate: string, reason: string): Promise<SiteCompany> => {
    const { data } = await apiClient.post<SiteCompany>(
      `/v2/site-companies/${siteCompanyId}/terminate`,
      { endDate, reason },
    );
    return data;
  },
};
