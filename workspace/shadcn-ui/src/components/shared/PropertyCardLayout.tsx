import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ReactNode } from 'react'

interface PropertyCardLayoutProps {
  imageUrl?: string
  title: string
  subtitle?: string
  price?: string
  badges?: Array<{ label: string; variant?: 'default' | 'secondary' | 'destructive' | 'outline' }>
  stats?: Array<{ icon: ReactNode; label: string }>
  actions?: ReactNode
  children?: ReactNode
  onClick?: () => void
}

export function PropertyCardLayout({
  imageUrl,
  title,
  subtitle,
  price,
  badges,
  stats,
  actions,
  children,
  onClick
}: PropertyCardLayoutProps) {
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer" onClick={onClick}>
      {imageUrl && (
        <div className="relative h-48 overflow-hidden">
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
          {badges && badges.length > 0 && (
            <div className="absolute top-2 right-2 flex gap-2">
              {badges.map((badge, idx) => (
                <Badge key={idx} variant={badge.variant}>
                  {badge.label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{title}</CardTitle>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          </div>
          {price && (
            <div className="text-right">
              <p className="text-xl font-bold text-primary">{price}</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {stats && stats.length > 0 && (
          <div className="flex gap-4 mb-4">
            {stats.map((stat, idx) => (
              <div key={idx} className="flex items-center gap-1 text-sm text-gray-600">
                {stat.icon}
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        )}
        {children}
        {actions && (
          <div className="flex gap-2 mt-4">
            {actions}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
